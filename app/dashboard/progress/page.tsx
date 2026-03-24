"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

type Milestone = "progress" | "start" | "final";

type Photo = {
  id: string;
  imageUrl: string;
  storagePath?: string;
  title?: string;
  note?: string;
  photoDate?: string;
  milestone?: Milestone;
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
  photoDate: string;
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

function getFallbackDateInputValue(photo?: Photo) {
  if (!photo) return getTodayDateInputValue();

  if (photo.photoDate) return photo.photoDate;

  if (photo.createdAt?.seconds) {
    const date = new Date(photo.createdAt.seconds * 1000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return getTodayDateInputValue();
}

function formatPhotoDate(photoDate?: string, createdAt?: { seconds?: number }) {
  if (photoDate) {
    const parsed = new Date(`${photoDate}T12:00:00`);
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (createdAt?.seconds) {
    const parsed = new Date(createdAt.seconds * 1000);
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
  const [milestone, setMilestone] = useState<Milestone>("progress");
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [workingPhotoId, setWorkingPhotoId] = useState<string | null>(null);

  const [approvalStatus, setApprovalStatus] = useState<
    "pending" | "approved" | "rejected" | "none"
  >("none");
  const [progressPhotosEnabled, setProgressPhotosEnabled] = useState(false);

  const [photoModalData, setPhotoModalData] = useState<PhotoModalData>({
    open: false,
    imageUrl: "",
    title: "",
    note: "",
    photoDate: "",
  });

  const loadPhotos = async (targetProfileId: string) => {
    const photosSnap = await getDocs(
      query(collection(db, "progressPhotos"), where("profileId", "==", targetProfileId))
    );

    const photoData = photosSnap.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<Photo, "id">),
      }))
      .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a)) as Photo[];

    setPhotos(photoData);
  };

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

  const notApproved = approvalStatus !== "approved";
  const notEnabled = !progressPhotosEnabled;

  const previewUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  const editingPhoto = useMemo(
    () => photos.find((photo) => photo.id === editingPhotoId) || null,
    [photos, editingPhotoId]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const beforePhoto = useMemo(() => {
    const starts = [...photos].filter((photo) => photo.milestone === "start");
    if (starts.length > 0) {
      return starts.sort((a, b) => getPhotoSortValue(a) - getPhotoSortValue(b))[0];
    }

    if (photos.length === 0) return null;

    return [...photos].sort((a, b) => getPhotoSortValue(a) - getPhotoSortValue(b))[0];
  }, [photos]);

  const afterPhoto = useMemo(() => {
    const finals = [...photos].filter((photo) => photo.milestone === "final");
    if (finals.length > 0) {
      return finals.sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a))[0];
    }

    if (photos.length === 0) return null;

    return [...photos].sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a))[0];
  }, [photos]);

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setNote("");
    setPhotoDate(getTodayDateInputValue());
    setMilestone("progress");
    setEditingPhotoId(null);
    setFileError("");
  };

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

  const startEdit = (photo: Photo) => {
    setEditingPhotoId(photo.id);
    setFile(null);
    setTitle(photo.title || "");
    setNote(photo.note || "");
    setPhotoDate(getFallbackDateInputValue(photo));
    setMilestone(photo.milestone || "progress");
    setFileError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const savePhoto = async () => {
    if (!profileId) return;

    if (editingPhotoId) {
      setUploading(true);

      try {
        await updateDoc(doc(db, "progressPhotos", editingPhotoId), {
          title: title.trim(),
          note: note.trim(),
          photoDate: photoDate || getTodayDateInputValue(),
          milestone,
        });

        await loadPhotos(profileId);
        resetForm();
      } catch (error) {
        console.error("Update photo error:", error);
      } finally {
        setUploading(false);
      }

      return;
    }

    if (!file || !photoDate) return;

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
        storagePath: fileRef.fullPath,
        title: title.trim(),
        note: note.trim(),
        photoDate,
        milestone,
        uploadedByRole: "user",
        createdAt: serverTimestamp(),
      });

      await loadPhotos(profileId);
      resetForm();
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photoId: string) => {
    const confirmed = window.confirm("Delete this photo?");
    if (!confirmed) return;

    setWorkingPhotoId(photoId);

    try {
      const photo = photos.find((item) => item.id === photoId);

      if (photo) {
        try {
          if (photo.storagePath) {
            await deleteObject(ref(storage, photo.storagePath));
          } else if (photo.imageUrl) {
            await deleteObject(ref(storage, photo.imageUrl));
          }
        } catch (storageError) {
          console.error("Storage delete error:", storageError);
        }
      }

      await deleteDoc(doc(db, "progressPhotos", photoId));

      if (editingPhotoId === photoId) {
        resetForm();
      }

      await loadPhotos(profileId);
    } catch (error) {
      console.error("Delete photo error:", error);
    } finally {
      setWorkingPhotoId(null);
    }
  };

  const openPhotoModal = (photo: Photo) => {
    setPhotoModalData({
      open: true,
      imageUrl: photo.imageUrl,
      title: photo.title || "Progress update",
      note: photo.note || "",
      photoDate: formatPhotoDate(photo.photoDate, photo.createdAt),
    });
  };

  const closePhotoModal = () => {
    setPhotoModalData({
      open: false,
      imageUrl: "",
      title: "",
      note: "",
      photoDate: "",
    });
  };

  if (loading) {
    return <p className="p-10 text-gray-500">Loading...</p>;
  }

  return (
    <>
      <div className="space-y-8">
        <section className="rounded-[32px] border bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Your Progress</h1>
          <p className="mt-2 text-gray-600">
            Track your transformation over time.
          </p>
        </section>

        {beforePhoto && afterPhoto && beforePhoto.id !== afterPhoto.id && (
          <section className="rounded-[32px] border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Before / After</h2>
            <p className="mt-2 text-gray-600">
              Quick visual comparison using your marked photos.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border p-3">
                <div className="mb-3 inline-flex rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  Before
                </div>
                <img
                  src={beforePhoto.imageUrl}
                  alt={beforePhoto.title || "Before photo"}
                  className="h-72 w-full rounded-xl object-cover"
                />
                <p className="mt-3 font-medium">
                  {beforePhoto.title || "Start photo"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatPhotoDate(beforePhoto.photoDate, beforePhoto.createdAt)}
                </p>
              </div>

              <div className="rounded-2xl border p-3">
                <div className="mb-3 inline-flex rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  After
                </div>
                <img
                  src={afterPhoto.imageUrl}
                  alt={afterPhoto.title || "After photo"}
                  className="h-72 w-full rounded-xl object-cover"
                />
                <p className="mt-3 font-medium">
                  {afterPhoto.title || "Final photo"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatPhotoDate(afterPhoto.photoDate, afterPhoto.createdAt)}
                </p>
              </div>
            </div>
          </section>
        )}

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
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">
                {editingPhotoId ? "Edit photo details" : "Upload new photo"}
              </h2>
              {editingPhotoId && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  Editing photo
                </span>
              )}
            </div>

            <p className="mt-2 text-gray-600">
              {editingPhotoId
                ? "Update the details of your progress photo."
                : "Add a new visual update to your progress timeline."}
            </p>

            {editingPhoto && (
              <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50 p-3">
                <img
                  src={editingPhoto.imageUrl}
                  alt={editingPhoto.title || "Editing photo"}
                  className="h-48 w-full rounded-xl object-cover"
                />
              </div>
            )}

            <div className="mt-6 space-y-4">
              {!editingPhotoId && (
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
              )}

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
                  Milestone
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["start", "progress", "final"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMilestone(value)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        milestone === value
                          ? value === "start"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : value === "final"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-300 bg-slate-100 text-slate-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {value === "start"
                        ? "Start"
                        : value === "final"
                        ? "Final"
                        : "Progress"}
                    </button>
                  ))}
                </div>
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

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={savePhoto}
                  disabled={uploading || (!editingPhotoId && !file) || !photoDate}
                  className="rounded-xl bg-black px-6 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading
                    ? "Saving..."
                    : editingPhotoId
                    ? "Save Changes"
                    : "Upload Photo"}
                </button>

                {editingPhotoId && (
                  <button
                    onClick={resetForm}
                    disabled={uploading}
                    className="rounded-xl border bg-white px-6 py-3 text-sm font-medium disabled:opacity-50"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
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
                  <button
                    type="button"
                    onClick={() => openPhotoModal(photo)}
                    className="w-full text-left"
                  >
                    <img
                      src={photo.imageUrl}
                      className="h-56 w-full rounded-xl object-cover"
                      alt={photo.title || "Progress photo"}
                    />
                  </button>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <MilestoneBadge milestone={photo.milestone || "progress"} />
                  </div>

                  <p className="mt-3 font-medium">
                    {photo.title || "Progress"}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {formatPhotoDate(photo.photoDate, photo.createdAt)}
                  </p>

                  {photo.note && (
                    <p className="mt-1 text-sm text-gray-600">{photo.note}</p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(photo)}
                      className="rounded-xl border px-3 py-2 text-sm font-medium"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => deletePhoto(photo.id)}
                      disabled={workingPhotoId === photo.id}
                      className="rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {workingPhotoId === photo.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {photoModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-4 shadow-xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {photoModalData.title}
                </h2>

                <p className="mt-2 text-sm text-gray-500">
                  {photoModalData.photoDate}
                </p>

                {photoModalData.note && (
                  <p className="mt-2 text-sm text-gray-600">
                    {photoModalData.note}
                  </p>
                )}
              </div>

              <button
                type="button"
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

function MilestoneBadge({ milestone }: { milestone: Milestone }) {
  const styles: Record<Milestone, string> = {
    start: "border-sky-200 bg-sky-50 text-sky-700",
    progress: "border-slate-200 bg-slate-50 text-slate-700",
    final: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  const label =
    milestone === "start"
      ? "Start"
      : milestone === "final"
      ? "Final"
      : "Progress";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[milestone]}`}
    >
      {label}
    </span>
  );
}