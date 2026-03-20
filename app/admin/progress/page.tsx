"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
} from "firebase/firestore";
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

type Profile = {
  id: string;
  fullName?: string;
};

type PhotoModalData = {
  open: boolean;
  imageUrl: string;
  title: string;
  note: string;
  uploadedByRole: "admin" | "user" | "";
  profileName: string;
};

export default function AdminProgressPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  const [photoModalData, setPhotoModalData] = useState<PhotoModalData>({
    open: false,
    imageUrl: "",
    title: "",
    note: "",
    uploadedByRole: "",
    profileName: "",
  });

  const { showToast } = useToast();

  const loadPage = async () => {
    const [photosSnapshot, profilesSnapshot] = await Promise.all([
      getDocs(query(collection(db, "progressPhotos"))),
      getDocs(query(collection(db, "profiles"))),
    ]);

    const photoData = photosSnapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<ProgressPhoto, "id">),
    })) as ProgressPhoto[];

    photoData.sort((a, b) => {
      const aSeconds = a.createdAt?.seconds || 0;
      const bSeconds = b.createdAt?.seconds || 0;
      return bSeconds - aSeconds;
    });

    const profileData = profilesSnapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<Profile, "id">),
    })) as Profile[];

    setPhotos(photoData);
    setProfiles(profileData);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadPage();
      } catch (error) {
        console.error("Load admin progress error:", error);
        showToast({
          title: "Could not load progress photos",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [showToast]);

  const profileNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((profile) => {
      map[profile.id] = profile.fullName || "Unnamed profile";
    });
    return map;
  }, [profiles]);

  const filteredPhotos = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return photos.filter((photo) => {
      const profileName = (profileNameMap[photo.profileId] || "").toLowerCase();
      const title = (photo.title || "").toLowerCase();
      const note = (photo.note || "").toLowerCase();

      const matchesSearch =
        !queryText ||
        profileName.includes(queryText) ||
        title.includes(queryText) ||
        note.includes(queryText);

      const matchesRole =
        roleFilter === "all" ? true : photo.uploadedByRole === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [photos, search, roleFilter, profileNameMap]);

  const startEdit = (photo: ProgressPhoto) => {
    setEditingPhotoId(photo.id);
    setEditTitle(photo.title || "");
    setEditNote(photo.note || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingPhotoId(null);
    setEditTitle("");
    setEditNote("");
  };

  const saveEdit = async () => {
    if (!editingPhotoId) return;

    setSavingId(editingPhotoId);

    try {
      await updateDoc(doc(db, "progressPhotos", editingPhotoId), {
        title: editTitle.trim(),
        note: editNote.trim(),
      });

      await loadPage();
      cancelEdit();

      showToast({
        title: "Photo updated",
        description: "Progress photo details were updated.",
        type: "success",
      });
    } catch (error) {
      console.error("Save admin progress edit error:", error);
      showToast({
        title: "Update failed",
        description: "Could not update the photo.",
        type: "error",
      });
    } finally {
      setSavingId(null);
    }
  };

  const deletePhoto = async (photoId: string) => {
    const confirmed = window.confirm("Delete this progress photo?");
    if (!confirmed) return;

    setSavingId(photoId);

    try {
      await deleteDoc(doc(db, "progressPhotos", photoId));

      if (editingPhotoId === photoId) {
        cancelEdit();
      }

      await loadPage();

      showToast({
        title: "Photo deleted",
        description: "The progress photo was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete admin progress photo error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the photo.",
        type: "error",
      });
    } finally {
      setSavingId(null);
    }
  };

  const openPhotoModal = (photo: ProgressPhoto) => {
    setPhotoModalData({
      open: true,
      imageUrl: photo.imageUrl,
      title: photo.title || "Progress update",
      note: photo.note || "",
      uploadedByRole: photo.uploadedByRole,
      profileName: profileNameMap[photo.profileId] || "Unnamed profile",
    });
  };

  const closePhotoModal = () => {
    setPhotoModalData({
      open: false,
      imageUrl: "",
      title: "",
      note: "",
      uploadedByRole: "",
      profileName: "",
    });
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Progress</h1>
          <p className="mt-2 text-gray-600">
            Review, edit, and manage progress photo uploads.
          </p>
        </div>

        {editingPhotoId && (
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Edit Photo Details</h2>

            <div className="mt-6 grid gap-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-xl border p-3"
              />

              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Note"
                className="min-h-[140px] w-full rounded-xl border p-3"
              />

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={saveEdit}
                  disabled={savingId === editingPhotoId}
                  className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingId === editingPhotoId ? "Saving..." : "Save Changes"}
                </button>

                <button
                  onClick={cancelEdit}
                  disabled={savingId === editingPhotoId}
                  className="rounded-xl border bg-white px-6 py-3 text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="text"
              placeholder="Search by client, title, or note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black md:flex-1"
            />

            <div className="flex flex-wrap gap-2">
              {(["all", "admin", "user"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setRoleFilter(value)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    roleFilter === value
                      ? "bg-black text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {value === "all"
                    ? "All"
                    : value === "admin"
                    ? "Coach uploads"
                    : "User uploads"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {filteredPhotos.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
            No progress photos found.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPhotos.map((photo) => (
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
                        : "User upload"}
                    </span>

                    <span className="text-xs text-gray-500">
                      {formatTimestamp(photo.createdAt)}
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-1 font-medium">
                    {photo.title || "Progress update"}
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    {profileNameMap[photo.profileId] || "Unnamed profile"}
                  </p>

                  {photo.note && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                      {photo.note}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => startEdit(photo)}
                      className="rounded-xl border px-3 py-2 text-sm font-medium"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deletePhoto(photo.id)}
                      disabled={savingId === photo.id}
                      className="rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {savingId === photo.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {photoModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-4 shadow-xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                    {photoModalData.uploadedByRole === "admin"
                      ? "Coach upload"
                      : "User upload"}
                  </span>

                  <span className="text-sm text-gray-500">
                    {photoModalData.profileName}
                  </span>
                </div>

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