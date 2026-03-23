"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { db, storage } from "@/lib/firebase";
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

type ScheduleType = "training" | "nutrition" | "activity";

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

type ScheduleItem = {
  id: string;
  profileId: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: ScheduleType;
  templateId?: string;
  title?: string;
  details?: string;
  displayTitle: string;
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

export default function AdminProfileDetailPage() {
  const params = useParams<{ id: string }>();
  const profileRouteId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [profileId, setProfileId] = useState("");
  const [profileUserId, setProfileUserId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);

  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);

  const [progressLoading, setProgressLoading] = useState(true);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [progressImageFile, setProgressImageFile] = useState<File | null>(null);
  const [progressTitle, setProgressTitle] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);

  const [photoModalData, setPhotoModalData] = useState<PhotoModalData>({
    open: false,
    imageUrl: "",
    title: "",
    note: "",
    uploadedByRole: "",
  });

  const [form, setForm] = useState({
    fullName: "",
    age: "",
    goal: "",
    assignedProgram: "",
    paymentStatus: "pending",
    approvalStatus: "approved",
    onboardingStatus: "incomplete",
    clientStatus: "active",
    height: "",
    weight: "",
    allergies: "",
    injuries: "",
    notes: "",
    internalNotes: "",
    progressPhotosEnabled: false,
  });

  const { showToast } = useToast();

  const resolveTemplateTitle = async (
    type: ScheduleType,
    templateId?: string
  ) => {
    if (!templateId) return "";

    let collectionName = "";
    if (type === "training") collectionName = "trainingTemplates";
    if (type === "nutrition") collectionName = "nutritionTemplates";
    if (type === "activity") collectionName = "activityTemplates";

    if (!collectionName) return "";

    try {
      const snap = await getDoc(doc(db, collectionName, templateId));
      if (!snap.exists()) return "";
      const data = snap.data() as { title?: string };
      return data.title || "";
    } catch {
      return "";
    }
  };

  const loadScheduleItems = async (targetProfileId: string) => {
    const q = query(
      collection(db, "scheduleItems"),
      where("profileId", "==", targetProfileId)
    );

    const snapshot = await getDocs(q);

    const rawItems = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ScheduleItem, "id" | "displayTitle">),
      }))
      .filter(
        (item) =>
          item.type === "training" ||
          item.type === "nutrition" ||
          item.type === "activity"
      ) as Array<Omit<ScheduleItem, "id" | "displayTitle">>;

    const resolved = await Promise.all(
      rawItems.map(async (item) => {
        const templateTitle = await resolveTemplateTitle(
          item.type,
          item.templateId
        );

        return {
          ...item,
          displayTitle: item.title?.trim() || templateTitle || "Session",
        } as ScheduleItem;
      })
    );

    resolved.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });

    setScheduleItems(resolved);
  };

  const loadProgressPhotos = async (targetProfileId: string) => {
    const q = query(
      collection(db, "progressPhotos"),
      where("profileId", "==", targetProfileId)
    );

    const snapshot = await getDocs(q);

    const data = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<ProgressPhoto, "id">),
    })) as ProgressPhoto[];

    data.sort((a, b) => {
      const aSeconds = a.createdAt?.seconds || 0;
      const bSeconds = b.createdAt?.seconds || 0;
      return bSeconds - aSeconds;
    });

    setProgressPhotos(data);
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        if (!profileRouteId || typeof profileRouteId !== "string") {
          window.location.replace("/admin/profiles");
          return;
        }

        setProfileId(profileRouteId);

        const profileRef = doc(db, "profiles", profileRouteId);
        const profileSnap = await getDoc(profileRef);

        if (!profileSnap.exists()) {
          window.location.replace("/admin/profiles");
          return;
        }

        const data = profileSnap.data() as {
          userId?: string;
          applicationId?: string;
          fullName?: string;
          age?: string;
          goal?: string;
          assignedProgram?: string;
          paymentStatus?: string;
          approvalStatus?: string;
          onboardingStatus?: string;
          clientStatus?: string;
          height?: string;
          weight?: string;
          allergies?: string;
          injuries?: string;
          notes?: string;
          internalNotes?: string;
          progressPhotosEnabled?: boolean;
        };

        setProfileUserId(data.userId || "");
        setApplicationId(data.applicationId || "");

        setForm({
          fullName: data.fullName || "",
          age: data.age || "",
          goal: data.goal || "",
          assignedProgram: data.assignedProgram || "",
          paymentStatus: data.paymentStatus || "pending",
          approvalStatus: data.approvalStatus || "approved",
          onboardingStatus: data.onboardingStatus || "incomplete",
          clientStatus: data.clientStatus || "active",
          height: data.height || "",
          weight: data.weight || "",
          allergies: data.allergies || "",
          injuries: data.injuries || "",
          notes: data.notes || "",
          internalNotes: data.internalNotes || "",
          progressPhotosEnabled: data.progressPhotosEnabled || false,
        });

        await Promise.all([
          loadScheduleItems(profileRouteId),
          loadProgressPhotos(profileRouteId),
        ]);
      } catch (error) {
        console.error("Load profile detail error:", error);
        showToast({
          title: "Could not load profile",
          description: "Please try refreshing the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
        setScheduleLoading(false);
        setProgressLoading(false);
      }
    };

    loadProfile();
  }, [profileRouteId, showToast]);

  const saveProfile = async () => {
    if (!profileId) return;

    setSaving(true);

    try {
      await updateDoc(doc(db, "profiles", profileId), {
        fullName: form.fullName,
        age: form.age,
        goal: form.goal,
        assignedProgram: form.assignedProgram,
        paymentStatus: form.paymentStatus,
        approvalStatus: form.approvalStatus,
        onboardingStatus: form.onboardingStatus,
        clientStatus: form.clientStatus,
        height: form.height,
        weight: form.weight,
        allergies: form.allergies,
        injuries: form.injuries,
        notes: form.notes,
        internalNotes: form.internalNotes,
        progressPhotosEnabled: form.progressPhotosEnabled,
      });

      showToast({
        title: "Profile updated",
        description: "Client profile was saved successfully.",
        type: "success",
      });
    } catch (error) {
      console.error("Save profile detail error:", error);
      showToast({
        title: "Save failed",
        description: "Could not update the client profile.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async () => {
    if (!profileId) return;

    const confirmed = window.confirm(
      "Delete this client completely?\n\nThis will permanently remove the profile, application, schedule items, and progress photos."
    );
    if (!confirmed) return;

    setDeletingClient(true);

    try {
      const [scheduleSnap, progressSnap] = await Promise.all([
        getDocs(
          query(collection(db, "scheduleItems"), where("profileId", "==", profileId))
        ),
        getDocs(
          query(collection(db, "progressPhotos"), where("profileId", "==", profileId))
        ),
      ]);

      const deletions: Promise<void>[] = [];

      scheduleSnap.docs.forEach((docItem) => {
        deletions.push(deleteDoc(doc(db, "scheduleItems", docItem.id)));
      });

      progressSnap.docs.forEach((docItem) => {
        deletions.push(deleteDoc(doc(db, "progressPhotos", docItem.id)));
      });

      if (applicationId) {
        deletions.push(deleteDoc(doc(db, "applications", applicationId)));
      } else if (profileUserId) {
        const applicationSnap = await getDocs(
          query(collection(db, "applications"), where("userId", "==", profileUserId))
        );

        applicationSnap.docs.forEach((docItem) => {
          deletions.push(deleteDoc(doc(db, "applications", docItem.id)));
        });
      }

      deletions.push(deleteDoc(doc(db, "profiles", profileId)));

      await Promise.all(deletions);

      showToast({
        title: "Client deleted",
        description:
          "The profile, application, schedule, and progress photos were removed.",
        type: "success",
      });

      window.location.replace("/admin/profiles");
    } catch (error) {
      console.error("Delete client error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the client completely.",
        type: "error",
      });
    } finally {
      setDeletingClient(false);
    }
  };

  const nextAction = useMemo(() => {
    if (form.approvalStatus !== "approved") return "Approve application";
    if (form.paymentStatus === "pending") return "Confirm payment";
    if (form.onboardingStatus === "incomplete") return "Complete profile";
    if (!form.assignedProgram.trim()) return "Assign program";
    if (form.clientStatus === "inactive") return "Reactivate if needed";
    return "Ready";
  }, [
    form.approvalStatus,
    form.paymentStatus,
    form.onboardingStatus,
    form.assignedProgram,
    form.clientStatus,
  ]);

  const groupedSchedule = useMemo(() => {
    return scheduleItems.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {} as Record<string, ScheduleItem[]>);
  }, [scheduleItems]);

  const resetProgressForm = () => {
    setProgressImageFile(null);
    setProgressTitle("");
    setProgressNote("");
    setEditingPhotoId(null);
  };

  const startEditPhoto = (photo: ProgressPhoto) => {
    setEditingPhotoId(photo.id);
    setProgressTitle(photo.title || "");
    setProgressNote(photo.note || "");
    setProgressImageFile(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
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

  const saveProgressPhoto = async () => {
    if (!profileId) return;

    if (editingPhotoId) {
      setProgressSaving(true);

      try {
        await updateDoc(doc(db, "progressPhotos", editingPhotoId), {
          title: progressTitle.trim(),
          note: progressNote.trim(),
        });

        resetProgressForm();
        await loadProgressPhotos(profileId);

        showToast({
          title: "Photo updated",
          description: "Progress photo details were updated.",
          type: "success",
        });
      } catch (error) {
        console.error("Update progress photo error:", error);
        showToast({
          title: "Update failed",
          description: "Could not update the progress photo.",
          type: "error",
        });
      } finally {
        setProgressSaving(false);
      }

      return;
    }

    if (!progressImageFile) {
      showToast({
        title: "Select an image",
        description: "Please choose a photo before uploading.",
        type: "error",
      });
      return;
    }

    setProgressSaving(true);

    try {
      const compressedFile = await compressImage(progressImageFile);

      const fileRef = ref(
        storage,
        `progressPhotos/${profileId}/${Date.now()}-${compressedFile.name}`
      );

      await uploadBytes(fileRef, compressedFile);
      const imageUrl = await getDownloadURL(fileRef);

      await addDoc(collection(db, "progressPhotos"), {
        profileId,
        userId: profileUserId || "",
        imageUrl,
        title: progressTitle.trim(),
        note: progressNote.trim(),
        uploadedByRole: "admin",
        createdAt: serverTimestamp(),
      });

      resetProgressForm();
      await loadProgressPhotos(profileId);

      showToast({
        title: "Photo uploaded",
        description: "Progress photo was uploaded successfully.",
        type: "success",
      });
    } catch (error) {
      console.error("Upload progress photo error:", error);
      showToast({
        title: "Upload failed",
        description: "Could not upload the progress photo.",
        type: "error",
      });
    } finally {
      setProgressSaving(false);
    }
  };

  const deleteProgressPhoto = async (photoId: string) => {
    const confirmed = window.confirm("Delete this progress photo?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "progressPhotos", photoId));

      if (editingPhotoId === photoId) {
        resetProgressForm();
      }

      await loadProgressPhotos(profileId);

      showToast({
        title: "Photo deleted",
        description: "Progress photo was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Delete progress photo error:", error);
      showToast({
        title: "Delete failed",
        description: "Could not delete the progress photo.",
        type: "error",
      });
    }
  };

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="/admin/profiles"
            className="inline-flex rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm"
          >
            Back to Profiles
          </a>

          <button
            onClick={deleteClient}
            disabled={deletingClient}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-50"
          >
            {deletingClient ? "Deleting..." : "Delete Client"}
          </button>
        </div>

        <div className="mt-6">
          <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
          <p className="mt-2 text-gray-600">
            Update client details, payment, profile completion, schedule, and
            progress.
          </p>
        </div>

        <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Summary
          </h2>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CompactSummaryPill label="Approval" value={form.approvalStatus} />
            <CompactSummaryPill label="Payment" value={form.paymentStatus} />
            <CompactSummaryPill
              label="Profile"
              value={
                form.onboardingStatus === "active"
                  ? "Completed"
                  : "Not completed"
              }
            />
            <CompactSummaryPill label="Client" value={form.clientStatus} />
            <CompactSummaryPill
              label="Program"
              value={form.assignedProgram || "Not assigned"}
            />
            <CompactSummaryPill
              label="Schedule"
              value={String(scheduleItems.length)}
            />
            <CompactSummaryPill
              label="Photos"
              value={String(progressPhotos.length)}
            />
            <CompactSummaryPill label="Next" value={nextAction} />
          </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">Basic Information</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-xl border p-3"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />

              <input
                className="rounded-xl border p-3"
                placeholder="Age"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />

              <input
                className="rounded-xl border p-3"
                placeholder="Height"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}
              />

              <input
                className="rounded-xl border p-3"
                placeholder="Weight"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </div>

            <textarea
              className="mt-3 min-h-[90px] w-full rounded-xl border p-3"
              placeholder="Goal"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </section>

          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">Program & Status</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage assignment, payment, approval, and client state.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Assigned Program
              </label>
              <input
                className="w-full rounded-xl border p-3"
                placeholder="e.g. 1 week plan T1"
                value={form.assignedProgram}
                onChange={(e) =>
                  setForm({ ...form, assignedProgram: e.target.value })
                }
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Payment
                </label>
                <select
                  className="w-full rounded-xl border p-3"
                  value={form.paymentStatus}
                  onChange={(e) =>
                    setForm({ ...form, paymentStatus: e.target.value })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="cash">Cash</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Approval
                </label>
                <select
                  className="w-full rounded-xl border p-3"
                  value={form.approvalStatus}
                  onChange={(e) =>
                    setForm({ ...form, approvalStatus: e.target.value })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Profile completion
                </label>
                <select
                  className="w-full rounded-xl border p-3"
                  value={form.onboardingStatus}
                  onChange={(e) =>
                    setForm({ ...form, onboardingStatus: e.target.value })
                  }
                >
                  <option value="incomplete">Not completed</option>
                  <option value="active">Completed</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Client status
                </label>
                <select
                  className="w-full rounded-xl border p-3"
                  value={form.clientStatus}
                  onChange={(e) =>
                    setForm({ ...form, clientStatus: e.target.value })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Client Schedule</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upcoming items shown in compact cards.
          </p>

          <div className="mt-5">
            {scheduleLoading ? (
              <p className="text-sm text-gray-500">Loading schedule...</p>
            ) : scheduleItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-500">
                No schedule items added yet.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(groupedSchedule).map(([date, items]) => (
                  <div key={date}>
                    <div className="mb-3 border-b pb-2">
                      <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
                        {formatDateLabel(date)}
                      </p>
                      <h3 className="mt-1 text-base font-semibold">{date}</h3>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border bg-gray-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <TypeBadge type={item.type} />
                            <p className="text-sm font-medium text-gray-700">
                              {item.startTime}
                              {item.endTime ? ` - ${item.endTime}` : ""}
                            </p>
                          </div>

                          <p className="mt-3 font-medium">{item.displayTitle}</p>

                          {item.details?.trim() && (
                            <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                              {item.details}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Health & Notes</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <textarea
              className="min-h-[100px] rounded-xl border p-3"
              placeholder="Allergies"
              value={form.allergies}
              onChange={(e) => setForm({ ...form, allergies: e.target.value })}
            />

            <textarea
              className="min-h-[100px] rounded-xl border p-3"
              placeholder="Injuries"
              value={form.injuries}
              onChange={(e) => setForm({ ...form, injuries: e.target.value })}
            />

            <textarea
              className="min-h-[120px] rounded-xl border p-3"
              placeholder="Client notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <textarea
              className="min-h-[120px] rounded-xl border p-3"
              placeholder="Internal admin notes"
              value={form.internalNotes}
              onChange={(e) =>
                setForm({ ...form, internalNotes: e.target.value })
              }
            />
          </div>

          <label className="mt-3 flex items-center gap-3 rounded-xl border p-4">
            <input
              type="checkbox"
              checked={form.progressPhotosEnabled}
              onChange={(e) =>
                setForm({
                  ...form,
                  progressPhotosEnabled: e.target.checked,
                })
              }
            />
            <span className="text-sm font-medium">Progress photos enabled</span>
          </label>
        </section>

        <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Progress Photos</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload, edit, and manage this client's progress updates.
          </p>

          <div className="mt-5 grid gap-8 xl:grid-cols-[300px_1fr]">
            <div className="space-y-4">
              {!editingPhotoId && (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setProgressImageFile(e.target.files?.[0] || null)
                  }
                  className="w-full rounded-xl border p-3"
                />
              )}

              <input
                type="text"
                placeholder="Title (optional)"
                value={progressTitle}
                onChange={(e) => setProgressTitle(e.target.value)}
                className="w-full rounded-xl border p-3"
              />

              <textarea
                placeholder="Note (optional)"
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                className="min-h-[120px] w-full rounded-xl border p-3"
              />

              <div className="flex gap-3">
                <button
                  onClick={saveProgressPhoto}
                  disabled={progressSaving}
                  className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {progressSaving
                    ? "Saving..."
                    : editingPhotoId
                    ? "Save Changes"
                    : "Upload Photo"}
                </button>

                {editingPhotoId && (
                  <button
                    onClick={resetProgressForm}
                    className="rounded-xl border px-5 py-3 text-sm font-medium"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div>
              {progressLoading ? (
                <p className="text-sm text-gray-500">Loading photos...</p>
              ) : progressPhotos.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-500">
                  No progress photos uploaded yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {progressPhotos.map((photo) => (
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
                        <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                          {photo.uploadedByRole === "admin"
                            ? "Coach upload"
                            : "User upload"}
                        </span>

                        <p className="mt-3 line-clamp-1 font-medium">
                          {photo.title || "Progress update"}
                        </p>

                        {photo.note && (
                          <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                            {photo.note}
                          </p>
                        )}

                        <div className="mt-4 flex gap-2">
                          <button
                            onClick={() => startEditPhoto(photo)}
                            className="rounded-xl border px-3 py-2 text-sm font-medium"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => deleteProgressPhoto(photo.id)}
                            className="rounded-xl border px-3 py-2 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="mt-5">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {photoModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-4 shadow-xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {photoModalData.uploadedByRole === "admin"
                    ? "Coach upload"
                    : "User upload"}
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

function CompactSummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-gray-700">{value}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: ScheduleType }) {
  return (
    <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-800">
      {type}
    </span>
  );
}

function formatDateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}