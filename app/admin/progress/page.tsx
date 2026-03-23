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

  const summary = useMemo(() => {
    return {
      total: photos.length,
      coachUploads: photos.filter((photo) => photo.uploadedByRole === "admin")
        .length,
      userUploads: photos.filter((photo) => photo.uploadedByRole === "user")
        .length,
      profilesWithPhotos: new Set(photos.map((photo) => photo.profileId)).size,
    };
  }, [photos]);

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
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">
          Loading progress photos...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
          </div>

          <div className="p-6 md:p-8">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Progress Tracking
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Progress
            </h1>

            <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
              Review, edit, and manage progress photo uploads across all clients.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total Photos" value={String(summary.total)} tone="light" />
          <SummaryCard
            label="Coach Uploads"
            value={String(summary.coachUploads)}
            tone="blue"
          />
          <SummaryCard
            label="User Uploads"
            value={String(summary.userUploads)}
            tone="success"
          />
          <SummaryCard
            label="Profiles With Photos"
            value={String(summary.profilesWithPhotos)}
            tone="dark"
          />
        </section>

        {editingPhotoId && (
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                Edit
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Edit Photo Details
              </h2>
            </div>

            <div className="mt-6 grid gap-4">
              <FieldGroup label="Title">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </FieldGroup>

              <FieldGroup label="Note">
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Note"
                  className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </FieldGroup>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={saveEdit}
                  disabled={savingId === editingPhotoId}
                  className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingId === editingPhotoId ? "Saving..." : "Save Changes"}
                </button>

                <button
                  onClick={cancelEdit}
                  disabled={savingId === editingPhotoId}
                  className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <input
              type="text"
              placeholder="Search by client, title, or note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] md:flex-1"
            />

            <div className="flex flex-wrap gap-2">
              {(["all", "admin", "user"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setRoleFilter(value)}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    roleFilter === value
                      ? "bg-slate-950 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
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
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
            No progress photos found.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPhotos.map((photo) => (
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
                          ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {photo.uploadedByRole === "admin"
                        ? "Coach upload"
                        : "User upload"}
                    </span>

                    <span className="text-xs text-slate-500">
                      {formatTimestamp(photo.createdAt)}
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-1 font-semibold text-slate-900">
                    {photo.title || "Progress update"}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {profileNameMap[photo.profileId] || "Unnamed profile"}
                  </p>

                  {photo.note && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {photo.note}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => startEdit(photo)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deletePhoto(photo.id)}
                      disabled={savingId === photo.id}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[30px] border border-white/70 bg-white p-4 shadow-[0_30px_100px_rgba(15,23,42,0.25)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      photoModalData.uploadedByRole === "admin"
                        ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {photoModalData.uploadedByRole === "admin"
                      ? "Coach upload"
                      : "User upload"}
                  </span>

                  <span className="text-sm text-slate-500">
                    {photoModalData.profileName}
                  </span>
                </div>

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

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "success" | "dark" | "light";
}) {
  const styles: Record<
    "blue" | "success" | "dark" | "light",
    {
      card: string;
      label: string;
      value: string;
    }
  > = {
    blue: {
      card: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
      label: "text-[#1d4ed8]",
      value: "text-slate-950",
    },
    success: {
      card: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
      label: "text-emerald-700",
      value: "text-slate-950",
    },
    dark: {
      card: "border-slate-800 bg-gradient-to-br from-slate-950 to-slate-800",
      label: "text-slate-300",
      value: "text-white",
    },
    light: {
      card: "border-slate-200 bg-white",
      label: "text-slate-500",
      value: "text-slate-950",
    },
  };

  return (
    <div
      className={`rounded-[24px] border p-5 shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${styles[tone].card}`}
    >
      <p className={`text-sm font-semibold ${styles[tone].label}`}>{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${styles[tone].value}`}>
        {value}
      </p>
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