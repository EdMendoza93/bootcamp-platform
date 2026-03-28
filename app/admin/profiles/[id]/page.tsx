"use client";

import Link from "next/link";
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
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { useToast } from "@/components/ui/ToastProvider";
import { BookingRecord } from "@/lib/bookings";
import {
  formatThreadTimestamp,
  getMessageCategoryClasses,
  getMessageCategoryLabel,
  MessageThreadRecord,
  sortThreads,
} from "@/lib/messages";
import {
  getDeliveryMethodLabel,
  getProviderRoleLabel,
  getSessionStatusTone,
  OnlineSessionRecord,
  OnlineSessionStatus,
  sortSessions,
} from "@/lib/online-sessions";

type ScheduleType = "training" | "nutrition" | "activity";
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

type SessionBoardFilter = "all" | OnlineSessionStatus;

type PhotoModalData = {
  open: boolean;
  imageUrl: string;
  title: string;
  note: string;
  photoDate: string;
  uploadedByRole: "admin" | "user" | "";
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

function getTodayDateInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getPhotoSortValue(photo: ProgressPhoto) {
  if (photo.photoDate) {
    return new Date(`${photo.photoDate}T12:00:00`).getTime();
  }

  return (photo.createdAt?.seconds || 0) * 1000;
}

function getFallbackDateInputValue(photo?: ProgressPhoto) {
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

function formatPhotoDate(
  photoDate?: string,
  createdAt?: { seconds?: number; nanoseconds?: number }
) {
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
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [onlineSessions, setOnlineSessions] = useState<OnlineSessionRecord[]>([]);
  const [sessionFilter, setSessionFilter] = useState<SessionBoardFilter>("all");
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messageThreads, setMessageThreads] = useState<MessageThreadRecord[]>([]);

  const [progressLoading, setProgressLoading] = useState(true);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [progressImageFile, setProgressImageFile] = useState<File | null>(null);
  const [progressTitle, setProgressTitle] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [progressPhotoDate, setProgressPhotoDate] = useState(
    getTodayDateInputValue()
  );
  const [progressMilestone, setProgressMilestone] =
    useState<Milestone>("progress");
  const [progressMeasurements, setProgressMeasurements] = useState<Measurements>(
    emptyMeasurements()
  );
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);

  const [photoModalData, setPhotoModalData] = useState<PhotoModalData>({
    open: false,
    imageUrl: "",
    title: "",
    note: "",
    photoDate: "",
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
    chest: "",
    hips: "",
    waist: "",
    thighs: "",
    calves: "",
    arms: "",
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

    const data = snapshot.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ProgressPhoto, "id">),
      }))
      .sort((a, b) => getPhotoSortValue(b) - getPhotoSortValue(a)) as ProgressPhoto[];

    setProgressPhotos(data);
  };

  const loadOnlineSessions = async (targetProfileId: string) => {
    const q = query(
      collection(db, "onlineSessions"),
      where("profileId", "==", targetProfileId)
    );

    const snapshot = await getDocs(q);

    const data = sortSessions(
      snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<OnlineSessionRecord, "id">),
      })) as OnlineSessionRecord[]
    );

    setOnlineSessions(data);
  };

  const loadBookings = async (targetProfileId: string) => {
    const q = query(
      collection(db, "bookings"),
      where("profileId", "==", targetProfileId)
    );

    const snapshot = await getDocs(q);

    const data = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<BookingRecord, "id">),
    })) as BookingRecord[];

    setBookings(data);
  };

  const loadMessageThreads = async (targetProfileId: string) => {
    const q = query(
      collection(db, "messageThreads"),
      where("clientProfileId", "==", targetProfileId)
    );

    const snapshot = await getDocs(q);

    const data = sortThreads(
      snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<MessageThreadRecord, "id">),
      })) as MessageThreadRecord[]
    );

    setMessageThreads(data);
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
          chest?: string;
          hips?: string;
          waist?: string;
          thighs?: string;
          calves?: string;
          arms?: string;
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
          chest: data.chest || "",
          hips: data.hips || "",
          waist: data.waist || "",
          thighs: data.thighs || "",
          calves: data.calves || "",
          arms: data.arms || "",
        });

        await Promise.all([
          loadBookings(profileRouteId),
          loadScheduleItems(profileRouteId),
          loadOnlineSessions(profileRouteId),
          loadMessageThreads(profileRouteId),
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
        setBookingsLoading(false);
        setScheduleLoading(false);
        setSessionsLoading(false);
        setThreadsLoading(false);
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
        fullName: form.fullName.trim(),
        age: form.age.trim(),
        goal: form.goal.trim(),
        assignedProgram: form.assignedProgram.trim(),
        paymentStatus: form.paymentStatus,
        approvalStatus: form.approvalStatus,
        onboardingStatus: form.onboardingStatus,
        clientStatus: form.clientStatus,
        height: form.height.trim(),
        weight: form.weight.trim(),
        allergies: form.allergies.trim(),
        injuries: form.injuries.trim(),
        notes: form.notes.trim(),
        internalNotes: form.internalNotes.trim(),
        progressPhotosEnabled: form.progressPhotosEnabled,
        chest: form.chest.trim(),
        hips: form.hips.trim(),
        waist: form.waist.trim(),
        thighs: form.thighs.trim(),
        calves: form.calves.trim(),
        arms: form.arms.trim(),
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

    const firstConfirm = window.confirm(
      "Delete this client completely?\n\nThis will permanently remove the profile, application, schedule items, progress photos, and photo files from storage."
    );
    if (!firstConfirm) return;

    const typed = window.prompt(
      'Type DELETE to confirm permanent removal of this client.'
    );
    if (typed !== "DELETE") {
      showToast({
        title: "Delete cancelled",
        description: 'Client was not deleted because "DELETE" was not entered.',
        type: "info",
      });
      return;
    }

    setDeletingClient(true);

    try {
      const [scheduleSnap, progressSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "scheduleItems"),
            where("profileId", "==", profileId)
          )
        ),
        getDocs(
          query(
            collection(db, "progressPhotos"),
            where("profileId", "==", profileId)
          )
        ),
      ]);

      await Promise.all(
        progressSnap.docs.map(async (docItem) => {
          const data = docItem.data() as {
            imageUrl?: string;
            storagePath?: string;
          };

          try {
            if (data.storagePath) {
              await deleteObject(ref(storage, data.storagePath));
            } else if (data.imageUrl) {
              await deleteObject(ref(storage, data.imageUrl));
            }
          } catch (storageError) {
            console.error("Storage delete error:", storageError);
          }
        })
      );

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
          query(
            collection(db, "applications"),
            where("userId", "==", profileUserId)
          )
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
          "The profile, application, schedule, progress photos, and storage files were removed.",
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

  const visibleSessions = useMemo(() => {
    return onlineSessions.filter(
      (item) => sessionFilter === "all" || item.status === sessionFilter
    );
  }, [onlineSessions, sessionFilter]);

  const editingPhoto = useMemo(
    () => progressPhotos.find((photo) => photo.id === editingPhotoId) || null,
    [progressPhotos, editingPhotoId]
  );

  const updateProgressMeasurement = (key: keyof Measurements, value: string) => {
    setProgressMeasurements((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetProgressForm = () => {
    setProgressImageFile(null);
    setProgressTitle("");
    setProgressNote("");
    setProgressPhotoDate(getTodayDateInputValue());
    setProgressMilestone("progress");
    setProgressMeasurements(emptyMeasurements());
    setEditingPhotoId(null);
  };

  const startEditPhoto = (photo: ProgressPhoto) => {
    setEditingPhotoId(photo.id);
    setProgressTitle(photo.title || "");
    setProgressNote(photo.note || "");
    setProgressPhotoDate(getFallbackDateInputValue(photo));
    setProgressMilestone(photo.milestone || "progress");
    setProgressMeasurements(normalizeMeasurements(photo.measurements));
    setProgressImageFile(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const openPhotoModal = (photo: ProgressPhoto) => {
    setPhotoModalData({
      open: true,
      imageUrl: photo.imageUrl,
      title: photo.title || "Progress update",
      note: photo.note || "",
      photoDate: formatPhotoDate(photo.photoDate, photo.createdAt),
      uploadedByRole: photo.uploadedByRole,
    });
  };

  const closePhotoModal = () => {
    setPhotoModalData({
      open: false,
      imageUrl: "",
      title: "",
      note: "",
      photoDate: "",
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
          photoDate: progressPhotoDate || getTodayDateInputValue(),
          milestone: progressMilestone,
          measurements: normalizeMeasurements(progressMeasurements),
        });

        await syncLatestMeasurementsToProfile(profileId);

        const profileSnap = await getDoc(doc(db, "profiles", profileId));
        const profileData = profileSnap.data() as Measurements | undefined;

        if (profileData) {
          setForm((prev) => ({
            ...prev,
            chest: profileData.chest || "",
            hips: profileData.hips || "",
            waist: profileData.waist || "",
            thighs: profileData.thighs || "",
            calves: profileData.calves || "",
            arms: profileData.arms || "",
          }));
        }

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

    if (!progressPhotoDate) {
      showToast({
        title: "Select a date",
        description: "Please choose the photo date before uploading.",
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
        storagePath: fileRef.fullPath,
        title: progressTitle.trim(),
        note: progressNote.trim(),
        photoDate: progressPhotoDate,
        milestone: progressMilestone,
        measurements: normalizeMeasurements(progressMeasurements),
        uploadedByRole: "admin",
        createdAt: serverTimestamp(),
      });

      await syncLatestMeasurementsToProfile(profileId);

      const profileSnap = await getDoc(doc(db, "profiles", profileId));
      const profileData = profileSnap.data() as Measurements | undefined;

      if (profileData) {
        setForm((prev) => ({
          ...prev,
          chest: profileData.chest || "",
          hips: profileData.hips || "",
          waist: profileData.waist || "",
          thighs: profileData.thighs || "",
          calves: profileData.calves || "",
          arms: profileData.arms || "",
        }));
      }

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
      const photo = progressPhotos.find((item) => item.id === photoId);

      if (photo) {
        try {
          if (photo.storagePath) {
            await deleteObject(ref(storage, photo.storagePath));
          } else if (photo.imageUrl) {
            await deleteObject(ref(storage, photo.imageUrl));
          }
        } catch (storageError) {
          console.error("Storage delete progress photo error:", storageError);
        }
      }

      await deleteDoc(doc(db, "progressPhotos", photoId));

      if (editingPhotoId === photoId) {
        resetProgressForm();
      }

      await syncLatestMeasurementsToProfile(profileId);

      const profileSnap = await getDoc(doc(db, "profiles", profileId));
      const profileData = profileSnap.data() as Measurements | undefined;

      if (profileData) {
        setForm((prev) => ({
          ...prev,
          chest: profileData.chest || "",
          hips: profileData.hips || "",
          waist: profileData.waist || "",
          thighs: profileData.thighs || "",
          calves: profileData.calves || "",
          arms: profileData.arms || "",
        }));
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
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/profiles"
            className="inline-flex rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            Back to Profiles
          </Link>

          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/schedule"
              className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Open Schedule
            </a>
            <a
              href="/admin/progress"
              className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              View All Progress
            </a>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="rounded-2xl bg-black px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <button
              onClick={deleteClient}
              disabled={deletingClient}
              className="rounded-2xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-md disabled:opacity-50"
            >
              {deletingClient ? "Deleting..." : "Delete Client"}
            </button>
          </div>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
            <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
          </div>

          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                  Client profile
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  {form.fullName || "Edit Profile"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                  Update client details, payment, profile completion, schedule,
                  and progress from one place.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
                <StatusBadge
                  label="Approval"
                  value={form.approvalStatus}
                  tone={
                    form.approvalStatus === "approved" ? "success" : "neutral"
                  }
                />
                <StatusBadge
                  label="Payment"
                  value={form.paymentStatus}
                  tone={
                    form.paymentStatus === "paid"
                      ? "success"
                      : form.paymentStatus === "cash"
                      ? "warning"
                      : "danger"
                  }
                />
                <StatusBadge
                  label="Onboarding"
                  value={form.onboardingStatus}
                  tone={
                    form.onboardingStatus === "active" ? "success" : "warning"
                  }
                />
                <StatusBadge
                  label="Client"
                  value={form.clientStatus}
                  tone={form.clientStatus === "active" ? "success" : "neutral"}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
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
              label="Bookings"
              value={String(bookings.length)}
            />
            <CompactSummaryPill
              label="Sessions"
              value={String(onlineSessions.length)}
            />
            <CompactSummaryPill
              label="Threads"
              value={String(messageThreads.length)}
            />
            <CompactSummaryPill
              label="Photos"
              value={String(progressPhotos.length)}
            />
            <CompactSummaryPill label="Next" value={nextAction} />
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-base font-semibold text-slate-950">
              Basic Information
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-2xl border border-slate-200 p-3"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />

              <input
                className="rounded-2xl border border-slate-200 p-3"
                placeholder="Age"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />

              <input
                className="rounded-2xl border border-slate-200 p-3"
                placeholder="Height"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}
              />

              <input
                className="rounded-2xl border border-slate-200 p-3"
                placeholder="Weight"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </div>

            <textarea
              className="mt-3 min-h-[100px] w-full rounded-2xl border border-slate-200 p-3"
              placeholder="Goal"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-base font-semibold text-slate-950">
              Program & Status
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage assignment, payment, approval, and client state.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Assigned Program
              </label>
              <input
                className="w-full rounded-2xl border border-slate-200 p-3"
                placeholder="e.g. 1 week plan T1"
                value={form.assignedProgram}
                onChange={(e) =>
                  setForm({ ...form, assignedProgram: e.target.value })
                }
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Payment
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-200 p-3"
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
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Approval
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-200 p-3"
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
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Profile completion
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-200 p-3"
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
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Client status
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-200 p-3"
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

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-base font-semibold text-slate-950">
            Current Measurements
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            These can be edited manually. The latest photo with measurements can
            also update these values automatically.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <input
              className="rounded-2xl border border-slate-200 p-3"
              placeholder="Chest"
              value={form.chest}
              onChange={(e) => setForm({ ...form, chest: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-200 p-3"
              placeholder="Hips"
              value={form.hips}
              onChange={(e) => setForm({ ...form, hips: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-200 p-3"
              placeholder="Waist"
              value={form.waist}
              onChange={(e) => setForm({ ...form, waist: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-200 p-3"
              placeholder="Thighs"
              value={form.thighs}
              onChange={(e) => setForm({ ...form, thighs: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-200 p-3"
              placeholder="Calves"
              value={form.calves}
              onChange={(e) => setForm({ ...form, calves: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-200 p-3"
              placeholder="Arms"
              value={form.arms}
              onChange={(e) => setForm({ ...form, arms: e.target.value })}
            />
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-base font-semibold text-slate-950">
            Client Schedule
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Upcoming items shown in compact cards.
          </p>

          <div className="mt-5">
            {scheduleLoading ? (
              <p className="text-sm text-slate-500">Loading schedule...</p>
            ) : scheduleItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                No schedule items added yet.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(groupedSchedule).map(([date, items]) => (
                  <div key={date}>
                    <div className="mb-3 border-b pb-2">
                      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
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
                          className="rounded-2xl border bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <TypeBadge type={item.type} />
                            <p className="text-sm font-medium text-slate-700">
                              {item.startTime}
                              {item.endTime ? ` - ${item.endTime}` : ""}
                            </p>
                          </div>

                          <p className="mt-3 font-medium text-slate-950">
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

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Bootcamp Bookings
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Reservation context connected to this client.
              </p>
            </div>

            <a
              href="/admin/bookings"
              className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Open Bookings
            </a>
          </div>

          <div className="mt-5">
            {bookingsLoading ? (
              <p className="text-sm text-slate-500">Loading bookings...</p>
            ) : bookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                No bookings found for this client.
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {bookings.map((booking) => (
                  <div key={booking.id} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {booking.status}
                      </span>
                      <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                        {booking.durationWeeks} week{booking.durationWeeks === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {booking.paymentStatus}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-slate-700">
                      Start week: {booking.startWeekId || "—"} · Capacity:{" "}
                      {booking.consumesCapacity ? "consumes" : "does not consume"}
                    </p>

                    {booking.shortStay ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Short stay · {booking.shortStayNights || 0} nights
                      </p>
                    ) : null}

                    {booking.customPrice ? (
                      <p className="mt-2 text-sm text-slate-600">
                        {booking.currency || "EUR"} {booking.customPrice}
                      </p>
                    ) : null}

                    {booking.notes?.trim() ? (
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                        {booking.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Online Sessions
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Private Zoom or WhatsApp sessions attached to this client.
              </p>
            </div>

            <select
              value={sessionFilter}
              onChange={(e) =>
                setSessionFilter(e.target.value as SessionBoardFilter)
              }
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none"
            >
              <option value="all">All status</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="mt-5">
            {sessionsLoading ? (
              <p className="text-sm text-slate-500">Loading sessions...</p>
            ) : visibleSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                No online sessions found for this client.
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {visibleSessions.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SessionStatusBadge status={item.status} />
                      <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                        {getProviderRoleLabel(item.providerRole)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {getDeliveryMethodLabel(item.deliveryMethod)}
                      </span>
                    </div>

                    <p className="mt-3 font-medium text-slate-950">
                      {item.title?.trim() || "Private session"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.scheduledDate} at {item.startTime} · {item.durationMinutes} min
                    </p>

                    {item.notes?.trim() ? (
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                        {item.notes}
                      </p>
                    ) : null}

                    {item.meetingLink ? (
                      <a
                        href={item.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex text-sm font-medium text-[#1d4ed8] hover:text-[#1e40af]"
                      >
                        Open meeting link
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Client Conversations
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Threads between this client and staff.
              </p>
            </div>

            <a
              href="/admin/messages"
              className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Open Messages
            </a>
          </div>

          <div className="mt-5">
            {threadsLoading ? (
              <p className="text-sm text-slate-500">Loading conversations...</p>
            ) : messageThreads.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                No threads found for this client.
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {messageThreads.map((thread) => (
                  <div key={thread.id} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getMessageCategoryClasses(thread.category)}`}
                      >
                        {getMessageCategoryLabel(thread.category)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {thread.status}
                      </span>
                    </div>

                    <p className="mt-3 font-medium text-slate-950">
                      {thread.subject}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                      {thread.lastMessagePreview || "No preview yet."}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-400">
                      {formatThreadTimestamp(thread.lastMessageAt || thread.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <h2 className="text-base font-semibold text-slate-950">
            Health & Notes
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <textarea
              className="min-h-[110px] rounded-2xl border border-slate-200 p-3"
              placeholder="Allergies"
              value={form.allergies}
              onChange={(e) => setForm({ ...form, allergies: e.target.value })}
            />

            <textarea
              className="min-h-[110px] rounded-2xl border border-slate-200 p-3"
              placeholder="Injuries"
              value={form.injuries}
              onChange={(e) => setForm({ ...form, injuries: e.target.value })}
            />

            <textarea
              className="min-h-[130px] rounded-2xl border border-slate-200 p-3"
              placeholder="Client notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <textarea
              className="min-h-[130px] rounded-2xl border border-slate-200 p-3"
              placeholder="Internal admin notes"
              value={form.internalNotes}
              onChange={(e) =>
                setForm({ ...form, internalNotes: e.target.value })
              }
            />
          </div>

          <label className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
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
            <span className="text-sm font-medium text-slate-800">
              Progress photos enabled
            </span>
          </label>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-950">
              Progress Photos
            </h2>
            {editingPhotoId && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                Editing photo
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Upload, edit, and manage this client&apos;s progress updates.
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

          <div className="mt-5 grid gap-8 xl:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              {!editingPhotoId && (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setProgressImageFile(e.target.files?.[0] || null)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-3"
                />
              )}

              <input
                type="date"
                value={progressPhotoDate}
                onChange={(e) => setProgressPhotoDate(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 p-3"
              />

              <div className="flex flex-wrap gap-2">
                {(["start", "progress", "final"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setProgressMilestone(value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      progressMilestone === value
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
                  value={progressMeasurements.chest || ""}
                  onChange={(e) =>
                    updateProgressMeasurement("chest", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-3"
                />
                <input
                  type="text"
                  placeholder="Hips"
                  value={progressMeasurements.hips || ""}
                  onChange={(e) =>
                    updateProgressMeasurement("hips", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-3"
                />
                <input
                  type="text"
                  placeholder="Waist"
                  value={progressMeasurements.waist || ""}
                  onChange={(e) =>
                    updateProgressMeasurement("waist", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-3"
                />
                <input
                  type="text"
                  placeholder="Thighs"
                  value={progressMeasurements.thighs || ""}
                  onChange={(e) =>
                    updateProgressMeasurement("thighs", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-3"
                />
                <input
                  type="text"
                  placeholder="Calves"
                  value={progressMeasurements.calves || ""}
                  onChange={(e) =>
                    updateProgressMeasurement("calves", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-3"
                />
                <input
                  type="text"
                  placeholder="Arms"
                  value={progressMeasurements.arms || ""}
                  onChange={(e) =>
                    updateProgressMeasurement("arms", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-3"
                />
              </div>

              <input
                type="text"
                placeholder="Title (optional)"
                value={progressTitle}
                onChange={(e) => setProgressTitle(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 p-3"
              />

              <textarea
                placeholder="Note (optional)"
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 p-3"
              />

              <div className="flex gap-3">
                <button
                  onClick={saveProgressPhoto}
                  disabled={progressSaving}
                  className="rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
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
                    className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-medium"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </div>

            <div>
              {progressLoading ? (
                <p className="text-sm text-slate-500">Loading photos...</p>
              ) : progressPhotos.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
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
                        type="button"
                        onClick={() => openPhotoModal(photo)}
                        className="w-full text-left"
                      >
                        <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          <img
                            src={photo.imageUrl}
                            alt={photo.title || "Progress photo"}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      </button>

                      <div className="mt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                            {photo.uploadedByRole === "admin"
                              ? "Coach upload"
                              : "User upload"}
                          </span>

                          <MilestoneBadge milestone={photo.milestone || "progress"} />

                          <span className="text-xs text-slate-500">
                            {formatPhotoDate(photo.photoDate, photo.createdAt)}
                          </span>
                        </div>

                        <p className="mt-3 line-clamp-1 font-medium text-slate-950">
                          {photo.title || "Progress update"}
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
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {photo.note}
                          </p>
                        )}

                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditPhoto(photo)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteProgressPhoto(photo.id)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
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

        <div className="pb-2">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-2xl bg-black px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
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
                <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {photoModalData.uploadedByRole === "admin"
                    ? "Coach upload"
                    : "User upload"}
                </span>

                <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
                  {photoModalData.title}
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  {photoModalData.photoDate}
                </p>

                {photoModalData.note && (
                  <p className="mt-2 text-sm text-slate-600">
                    {photoModalData.note}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={closePhotoModal}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex justify-center rounded-2xl bg-slate-50 p-4">
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
    <div className="rounded-xl border bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: ScheduleType }) {
  return (
    <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-800">
      {type}
    </span>
  );
}

function SessionStatusBadge({ status }: { status: OnlineSessionStatus }) {
  const tone = getSessionStatusTone(status);

  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${classes}`}
    >
      {status}
    </span>
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
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[milestone]}`}>
      {label}
    </span>
  );
}

function StatusBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${styles[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
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
