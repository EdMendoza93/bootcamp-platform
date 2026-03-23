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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

        const data = profileSnap.data() as any;
        setProfileUserId(data.userId || "");

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
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading profile...</p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-6 pb-28">
        <a
          href="/admin/profiles"
          className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        >
          Back to Profiles
        </a>

        <section className="overflow-hidden rounded-[34px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[33px] bg-transparent px-0 py-0" />
          </div>

          <div className="relative overflow-hidden p-6 md:p-8">
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-36 w-36 rounded-full bg-emerald-300/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                  Client profile
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                  {form.fullName || "Unnamed profile"}
                </h1>

                <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                  Manage client details, status, program setup, schedule, and progress
                  from one place.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <StatusChip
                    tone={form.clientStatus === "inactive" ? "danger" : "success"}
                    label={`Client: ${form.clientStatus}`}
                  />
                  <StatusChip
                    tone={
                      form.paymentStatus === "paid"
                        ? "success"
                        : form.paymentStatus === "cash"
                        ? "violet"
                        : "warning"
                    }
                    label={`Payment: ${form.paymentStatus}`}
                  />
                  <StatusChip
                    tone={form.onboardingStatus === "active" ? "success" : "blue"}
                    label={`Profile: ${
                      form.onboardingStatus === "active"
                        ? "completed"
                        : "incomplete"
                    }`}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
                <HeroStatCard label="Program" value={form.assignedProgram || "Not assigned"} />
                <HeroStatCard label="Next action" value={nextAction} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CompactSummaryPill label="Approval" value={form.approvalStatus} />
          <CompactSummaryPill label="Schedule items" value={String(scheduleItems.length)} />
          <CompactSummaryPill label="Progress photos" value={String(progressPhotos.length)} />
          <CompactSummaryPill
            label="Photo uploads"
            value={form.progressPhotosEnabled ? "Enabled" : "Disabled"}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
            <SectionHeader
              eyebrow="Basic information"
              title="Personal Details"
              description="Core information used by the team to personalize the client experience."
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Full name">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Full name"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </FieldGroup>

              <FieldGroup label="Age">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Age"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                />
              </FieldGroup>

              <FieldGroup label="Height">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Height"
                  value={form.height}
                  onChange={(e) => setForm({ ...form, height: e.target.value })}
                />
              </FieldGroup>

              <FieldGroup label="Weight">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Weight"
                  value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: e.target.value })}
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Goal" className="mt-4">
              <textarea
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="Goal"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              />
            </FieldGroup>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
            <SectionHeader
              eyebrow="Program & status"
              title="Client Management"
              description="Control assignment, payment, approval, onboarding, and overall client status."
            />

            <FieldGroup label="Assigned Program" className="mt-5">
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                placeholder="e.g. 1 week plan T1"
                value={form.assignedProgram}
                onChange={(e) =>
                  setForm({ ...form, assignedProgram: e.target.value })
                }
              />
            </FieldGroup>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Payment">
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  value={form.paymentStatus}
                  onChange={(e) =>
                    setForm({ ...form, paymentStatus: e.target.value })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="cash">Cash</option>
                  <option value="paid">Paid</option>
                </select>
              </FieldGroup>

              <FieldGroup label="Approval">
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  value={form.approvalStatus}
                  onChange={(e) =>
                    setForm({ ...form, approvalStatus: e.target.value })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                </select>
              </FieldGroup>

              <FieldGroup label="Profile completion">
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  value={form.onboardingStatus}
                  onChange={(e) =>
                    setForm({ ...form, onboardingStatus: e.target.value })
                  }
                >
                  <option value="incomplete">Not completed</option>
                  <option value="active">Completed</option>
                </select>
              </FieldGroup>

              <FieldGroup label="Client status">
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  value={form.clientStatus}
                  onChange={(e) =>
                    setForm({ ...form, clientStatus: e.target.value })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </FieldGroup>
            </div>
          </section>
        </div>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
          <SectionHeader
            eyebrow="Schedule"
            title="Client Schedule"
            description="A structured view of all scheduled items currently assigned to this client."
          />

          <div className="mt-5">
            {scheduleLoading ? (
              <p className="text-sm text-slate-500">Loading schedule...</p>
            ) : scheduleItems.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                No schedule items added yet.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(groupedSchedule).map(([date, items]) => (
                  <div key={date}>
                    <div className="mb-3 border-b border-slate-100 pb-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {formatDateLabel(date)}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-slate-950">
                        {date}
                      </h3>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <TypeBadge type={item.type} />
                            <p className="text-sm font-semibold text-slate-700">
                              {item.startTime}
                              {item.endTime ? ` - ${item.endTime}` : ""}
                            </p>
                          </div>

                          <p className="mt-3 font-semibold text-slate-900">
                            {item.displayTitle}
                          </p>

                          {item.details?.trim() && (
                            <p className="mt-2 line-clamp-2 text-sm text-slate-600">
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

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
            <SectionHeader
              eyebrow="Health & notes"
              title="Health Information"
              description="Important physical and context details the team should keep in mind."
            />

            <div className="mt-5 grid gap-4">
              <FieldGroup label="Allergies">
                <textarea
                  className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Allergies"
                  value={form.allergies}
                  onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                />
              </FieldGroup>

              <FieldGroup label="Injuries">
                <textarea
                  className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Injuries"
                  value={form.injuries}
                  onChange={(e) => setForm({ ...form, injuries: e.target.value })}
                />
              </FieldGroup>

              <FieldGroup label="Client notes">
                <textarea
                  className="min-h-[130px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Client notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </FieldGroup>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
            <SectionHeader
              eyebrow="Internal"
              title="Admin Notes & Controls"
              description="Private admin context and platform permissions for this client."
            />

            <div className="mt-5 grid gap-4">
              <FieldGroup label="Internal admin notes">
                <textarea
                  className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  placeholder="Internal admin notes"
                  value={form.internalNotes}
                  onChange={(e) =>
                    setForm({ ...form, internalNotes: e.target.value })
                  }
                />
              </FieldGroup>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Progress photos enabled
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Allow this client to upload progress images from their dashboard.
                  </p>
                </div>
              </label>
            </div>
          </section>
        </div>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur md:p-6">
          <SectionHeader
            eyebrow="Progress"
            title="Progress Photos"
            description="Track transformation visually, upload coach-side updates, and keep the client timeline organized."
          />

          <div className="mt-5 grid gap-8 xl:grid-cols-[340px_1fr]">
            <div className="space-y-4">
              {!editingPhotoId && (
                <FieldGroup label="Choose image">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setProgressImageFile(e.target.files?.[0] || null)
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#eff6ff] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#1d4ed8] focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </FieldGroup>
              )}

              <FieldGroup label="Title">
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={progressTitle}
                  onChange={(e) => setProgressTitle(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </FieldGroup>

              <FieldGroup label="Note">
                <textarea
                  placeholder="Note (optional)"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </FieldGroup>

              <div className="flex gap-3">
                <button
                  onClick={saveProgressPhoto}
                  disabled={progressSaving}
                  className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-5 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div>
              {progressLoading ? (
                <p className="text-sm text-slate-500">Loading photos...</p>
              ) : progressPhotos.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No progress photos uploaded yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {progressPhotos.map((photo) => (
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
                                : "border-slate-200 bg-slate-50 text-slate-700"
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

                        {photo.note && (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {photo.note}
                          </p>
                        )}

                        <div className="mt-4 flex gap-2">
                          <button
                            onClick={() => startEditPhoto(photo)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => deleteProgressPhoto(photo.id)}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Save profile changes
            </p>
            <p className="text-xs text-slate-500">
              Update client information, status, notes, and permissions.
            </p>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {photoModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[30px] border border-white/70 bg-white p-4 shadow-[0_30px_100px_rgba(15,23,42,0.25)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    photoModalData.uploadedByRole === "admin"
                      ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {photoModalData.uploadedByRole === "admin"
                    ? "Coach upload"
                    : "User upload"}
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
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      )}
    </div>
  );
}

function HeroStatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
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
    <div className="rounded-[18px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "danger" | "warning" | "blue" | "violet";
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${styles[tone]}`}
    >
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: ScheduleType }) {
  const styles: Record<ScheduleType, string> = {
    training: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    nutrition: "border-emerald-200 bg-emerald-50 text-emerald-700",
    activity: "border-violet-200 bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${styles[type]}`}
    >
      {type}
    </span>
  );
}

function FieldGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
    </div>
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