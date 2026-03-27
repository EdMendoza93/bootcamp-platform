"use client";

import { useEffect, useMemo, useState } from "react";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { useToast } from "@/components/ui/ToastProvider";

type Milestone = "progress" | "start" | "final";

type Measurements = {
  chest?: string;
  hips?: string;
  waist?: string;
  thighs?: string;
  calves?: string;
  arms?: string;
};

type ProgressPhoto = {
  id: string;
  profileId: string;
  userId?: string;
  imageUrl: string;
  storagePath?: string;
  title?: string;
  note?: string;
  photoDate?: string;
  milestone?: Milestone;
  measurements?: Measurements;
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
  photoDate: string;
};

function emptyMeasurements(): Measurements {
  return {
    chest: "",
    hips: "",
    waist: "",
    thighs: "",
    calves: "",
    arms: "",
  };
}

function normalizeMeasurements(input?: Measurements): Measurements {
  return {
    chest: input?.chest || "",
    hips: input?.hips || "",
    waist: input?.waist || "",
    thighs: input?.thighs || "",
    calves: input?.calves || "",
    arms: input?.arms || "",
  };
}

function hasAnyMeasurements(input?: Measurements) {
  if (!input) return false;
  return Object.values(input).some((value) => (value || "").trim() !== "");
}

function getPhotoSortValue(photo: ProgressPhoto) {
  if (photo.photoDate) {
    return new Date(`${photo.photoDate}T12:00:00`).getTime();
  }

  return (photo.createdAt?.seconds || 0) * 1000;
}

function getFallbackDateInputValue(photo?: ProgressPhoto) {
  if (!photo) return "";

  if (photo.photoDate) return photo.photoDate;

  if (photo.createdAt?.seconds) {
    const date = new Date(photo.createdAt.seconds * 1000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function formatTimestamp(
  photoDate?: string,
  createdAt?: { seconds?: number; nanoseconds?: number }
) {
  if (photoDate) {
    const date = new Date(`${photoDate}T12:00:00`);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (createdAt?.seconds) {
    const date = new Date(createdAt.seconds * 1000);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return "No date";
}

async function syncLatestMeasurementsToProfile(profileId: string) {
  const photosSnap = await getDocs(
    query(collection(db, "progressPhotos"), where("profileId", "==", profileId))
  );

  const photos = photosSnap.docs
    .map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<ProgressPhoto, "id">),
    }))
    .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a)) as ProgressPhoto[];

  const latestWithMeasurements = photos.find((photo) =>
    hasAnyMeasurements(photo.measurements)
  );

  if (!latestWithMeasurements) return;

  const measurements = normalizeMeasurements(latestWithMeasurements.measurements);

  await updateDoc(doc(db, "profiles", profileId), {
    chest: measurements.chest,
    hips: measurements.hips,
    waist: measurements.waist,
    thighs: measurements.thighs,
    calves: measurements.calves,
    arms: measurements.arms,
  });
}

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
  const [editPhotoDate, setEditPhotoDate] = useState("");
  const [editMilestone, setEditMilestone] = useState<Milestone>("progress");
  const [editMeasurements, setEditMeasurements] = useState<Measurements>(
    emptyMeasurements()
  );

  const [photoModalData, setPhotoModalData] = useState<PhotoModalData>({
    open: false,
    imageUrl: "",
    title: "",
    note: "",
    uploadedByRole: "",
    profileName: "",
    photoDate: "",
  });

  const { showToast } = useToast();

  const loadPage = async () => {
    const [photosSnapshot, profilesSnapshot] = await Promise.all([
      getDocs(query(collection(db, "progressPhotos"))),
      getDocs(query(collection(db, "profiles"))),
    ]);

    const photoData = photosSnapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ProgressPhoto, "id">),
      }))
      .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a)) as ProgressPhoto[];

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

  const editingPhoto = useMemo(
    () => photos.find((photo) => photo.id === editingPhotoId) || null,
    [photos, editingPhotoId]
  );

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

  const updateMeasurement = (key: keyof Measurements, value: string) => {
    setEditMeasurements((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const startEdit = (photo: ProgressPhoto) => {
    setEditingPhotoId(photo.id);
    setEditTitle(photo.title || "");
    setEditNote(photo.note || "");
    setEditPhotoDate(getFallbackDateInputValue(photo));
    setEditMilestone(photo.milestone || "progress");
    setEditMeasurements(normalizeMeasurements(photo.measurements));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingPhotoId(null);
    setEditTitle("");
    setEditNote("");
    setEditPhotoDate("");
    setEditMilestone("progress");
    setEditMeasurements(emptyMeasurements());
  };

  const saveEdit = async () => {
    if (!editingPhotoId || !editingPhoto) return;

    setSavingId(editingPhotoId);

    try {
      await updateDoc(doc(db, "progressPhotos", editingPhotoId), {
        title: editTitle.trim(),
        note: editNote.trim(),
        photoDate: editPhotoDate || "",
        milestone: editMilestone,
        measurements: normalizeMeasurements(editMeasurements),
      });

      await syncLatestMeasurementsToProfile(editingPhoto.profileId);
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
      const photo = photos.find((item) => item.id === photoId);

      if (photo) {
        try {
          if (photo.storagePath) {
            await deleteObject(ref(storage, photo.storagePath));
          } else if (photo.imageUrl) {
            await deleteObject(ref(storage, photo.imageUrl));
          }
        } catch (storageError) {
          console.error("Storage delete admin progress photo error:", storageError);
        }
      }

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
      photoDate: formatTimestamp(photo.photoDate, photo.createdAt),
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
      photoDate: "",
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
          <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
          </div>

          <div className="relative overflow-hidden p-6 md:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

            <div className="relative">
              <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                Progress
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Progress Review
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
                Review, edit, and manage progress photo uploads across the whole platform.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <HeaderPill label="Photos" value={String(photos.length)} />
                <HeaderPill label="Profiles" value={String(profiles.length)} />
                <HeaderPill label="Filtered" value={String(filteredPhotos.length)} />
              </div>
            </div>
          </div>
        </section>

        {editingPhotoId && (
          <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-950">Edit Photo Details</h2>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                Editing photo
              </span>
            </div>

            {editingPhoto && (
              <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50 p-3">
                <img
                  src={editingPhoto.imageUrl}
                  alt={editingPhoto.title || "Editing photo"}
                  className="h-48 w-full rounded-xl object-cover"
                />
              </div>
            )}

            <div className="mt-6 grid gap-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-xl border p-3"
              />

              <input
                type="date"
                value={editPhotoDate}
                onChange={(e) => setEditPhotoDate(e.target.value)}
                className="w-full rounded-xl border p-3"
              />

              <div className="flex flex-wrap gap-2">
                {(["start", "progress", "final"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEditMilestone(value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      editMilestone === value
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

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Chest"
                  value={editMeasurements.chest || ""}
                  onChange={(e) => updateMeasurement("chest", e.target.value)}
                  className="w-full rounded-xl border p-3"
                />
                <input
                  type="text"
                  placeholder="Hips"
                  value={editMeasurements.hips || ""}
                  onChange={(e) => updateMeasurement("hips", e.target.value)}
                  className="w-full rounded-xl border p-3"
                />
                <input
                  type="text"
                  placeholder="Waist"
                  value={editMeasurements.waist || ""}
                  onChange={(e) => updateMeasurement("waist", e.target.value)}
                  className="w-full rounded-xl border p-3"
                />
                <input
                  type="text"
                  placeholder="Thighs"
                  value={editMeasurements.thighs || ""}
                  onChange={(e) => updateMeasurement("thighs", e.target.value)}
                  className="w-full rounded-xl border p-3"
                />
                <input
                  type="text"
                  placeholder="Calves"
                  value={editMeasurements.calves || ""}
                  onChange={(e) => updateMeasurement("calves", e.target.value)}
                  className="w-full rounded-xl border p-3"
                />
                <input
                  type="text"
                  placeholder="Arms"
                  value={editMeasurements.arms || ""}
                  onChange={(e) => updateMeasurement("arms", e.target.value)}
                  className="w-full rounded-xl border p-3"
                />
              </div>

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
                  Cancel edit
                </button>
              </div>
            </div>
          </section>
        )}

          <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
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

            <div className="mt-4 rounded-[22px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-4 text-sm leading-6 text-slate-700">
              Progress photos are now presented as an admin review surface. This visual pass improves scanning and editing comfort without changing how uploads or measurements are stored.
            </div>
          </section>

        {filteredPhotos.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/90 p-10 text-center text-sm text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
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
                  type="button"
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

                    <MilestoneBadge milestone={photo.milestone || "progress"} />

                    <span className="text-xs text-gray-500">
                      {formatTimestamp(photo.photoDate, photo.createdAt)}
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-1 font-medium">
                    {photo.title || "Progress update"}
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    {profileNameMap[photo.profileId] || "Unnamed profile"}
                  </p>

                  {hasAnyMeasurements(photo.measurements) && (
                    <div className="mt-3 rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">
                      <div className="grid gap-1 sm:grid-cols-2">
                        <span>Chest: {photo.measurements?.chest || "—"}</span>
                        <span>Hips: {photo.measurements?.hips || "—"}</span>
                        <span>Waist: {photo.measurements?.waist || "—"}</span>
                        <span>Thighs: {photo.measurements?.thighs || "—"}</span>
                        <span>Calves: {photo.measurements?.calves || "—"}</span>
                        <span>Arms: {photo.measurements?.arms || "—"}</span>
                      </div>
                    </div>
                  )}

                  {photo.note && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                      {photo.note}
                    </p>
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

function HeaderPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
      {label}: <span className="text-slate-950">{value}</span>
    </div>
  );
}
