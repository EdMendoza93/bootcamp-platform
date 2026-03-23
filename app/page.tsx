"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

type ApplicationStatus = "none" | "pending" | "approved" | "rejected";
type OnboardingStatus = "none" | "incomplete" | "active";
type ScheduleType = "training" | "nutrition" | "activity";

type ScheduleItem = {
  id: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: ScheduleType;
  templateId?: string;
  title?: string;
  details?: string;
  displayTitle: string;
};

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

type ScheduleModalData = {
  open: boolean;
  title: string;
  type: ScheduleType | "";
  content: string;
  description: string;
};

type PhotoModalData = {
  open: boolean;
  imageUrl: string;
  title: string;
  note: string;
  uploadedByRole: "admin" | "user" | "";
};

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [applicationStatus, setApplicationStatus] =
    useState<ApplicationStatus>("none");
  const [hasProfile, setHasProfile] = useState(false);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus>("none");
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [allergies, setAllergies] = useState("");
  const [injuries, setInjuries] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [progressPhotosEnabled, setProgressPhotosEnabled] = useState(true);

  const [scheduleModalData, setScheduleModalData] = useState<ScheduleModalData>({
    open: false,
    title: "",
    type: "",
    content: "",
    description: "",
  });
  const [scheduleModalLoading, setScheduleModalLoading] = useState(false);

  const [photoModalData, setPhotoModalData] = useState<PhotoModalData>({
    open: false,
    imageUrl: "",
    title: "",
    note: "",
    uploadedByRole: "",
  });

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

  const loadDashboard = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      window.location.replace("/login");
      return;
    }

    setUser(currentUser);

    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data() as { role?: string };

      if (userData.role === "admin") {
        window.location.replace("/admin");
        return;
      }
    }

    const appQuery = await getDocs(
      query(
        collection(db, "applications"),
        where("userId", "==", currentUser.uid)
      )
    );

    if (!appQuery.empty) {
      const appData = appQuery.docs[0].data() as {
        status?: ApplicationStatus;
      };
      setApplicationStatus(appData.status || "none");
    } else {
      setApplicationStatus("none");
    }

    const profileQuery = await getDocs(
      query(collection(db, "profiles"), where("userId", "==", currentUser.uid))
    );

    if (!profileQuery.empty) {
      const profileDoc = profileQuery.docs[0];
      const profileData = profileDoc.data() as {
        onboardingStatus?: OnboardingStatus;
        paymentStatus?: string;
        height?: string;
        weight?: string;
        allergies?: string;
        injuries?: string;
        notes?: string;
        progressPhotosEnabled?: boolean;
      };

      setHasProfile(true);
      setOnboardingStatus(profileData.onboardingStatus || "none");
      setPaymentStatus(profileData.paymentStatus || "pending");
      setHeight(profileData.height || "");
      setWeight(profileData.weight || "");
      setAllergies(profileData.allergies || "");
      setInjuries(profileData.injuries || "");
      setNotes(profileData.notes || "");
      setProgressPhotosEnabled(profileData.progressPhotosEnabled !== false);

      const scheduleQuery = await getDocs(
        query(
          collection(db, "scheduleItems"),
          where("profileId", "==", profileDoc.id)
        )
      );

      const rawItems = scheduleQuery.docs
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

      const progressQuery = await getDocs(
        query(
          collection(db, "progressPhotos"),
          where("profileId", "==", profileDoc.id)
        )
      );

      const progressData = progressQuery.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ProgressPhoto, "id">),
      })) as ProgressPhoto[];

      progressData.sort((a, b) => {
        const aSeconds = a.createdAt?.seconds || 0;
        const bSeconds = b.createdAt?.seconds || 0;
        return bSeconds - aSeconds;
      });

      setProgressPhotos(progressData);
    } else {
      setHasProfile(false);
      setOnboardingStatus("none");
      setPaymentStatus("pending");
      setHeight("");
      setWeight("");
      setAllergies("");
      setInjuries("");
      setNotes("");
      setScheduleItems([]);
      setProgressPhotos([]);
      setProgressPhotosEnabled(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await auth.authStateReady();
        if (!cancelled) await loadDashboard();
      } catch (error) {
        console.error("Dashboard error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    const interval = setInterval(() => {
      loadDashboard();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const refreshDashboard = async () => {
    setRefreshing(true);
    try {
      await loadDashboard();
    } catch (error) {
      console.error("Refresh dashboard error:", error);
      alert("Failed to refresh dashboard.");
    } finally {
      setRefreshing(false);
    }
  };

  const openScheduleModal = async (item: ScheduleItem) => {
    setScheduleModalLoading(true);
    setScheduleModalData({
      open: true,
      title: item.displayTitle,
      type: item.type,
      content: "",
      description: "",
    });

    try {
      if (!item.templateId) {
        setScheduleModalData({
          open: true,
          title: item.displayTitle,
          type: item.type,
          content: item.details || "No details available.",
          description: "Custom schedule item",
        });
        return;
      }

      let collectionName = "";
      if (item.type === "training") collectionName = "trainingTemplates";
      if (item.type === "nutrition") collectionName = "nutritionTemplates";
      if (item.type === "activity") collectionName = "activityTemplates";

      if (!collectionName) {
        setScheduleModalData({
          open: true,
          title: item.displayTitle,
          type: item.type,
          content: "Unsupported item type.",
          description: "",
        });
        return;
      }

      const snap = await getDoc(doc(db, collectionName, item.templateId));

      if (!snap.exists()) {
        setScheduleModalData({
          open: true,
          title: item.displayTitle,
          type: item.type,
          content: item.details || "Linked template not found.",
          description: "",
        });
        return;
      }

      const data = snap.data() as {
        title?: string;
        description?: string;
        content?: string;
      };

      const combinedContent = item.details
        ? `${data.content || ""}\n\nExtra notes:\n${item.details}`
        : data.content || "No details available.";

      setScheduleModalData({
        open: true,
        title: data.title || item.displayTitle,
        type: item.type,
        description: data.description || "",
        content: combinedContent,
      });
    } catch (error) {
      console.error("Open schedule modal error:", error);
      setScheduleModalData({
        open: true,
        title: item.displayTitle,
        type: item.type,
        content: "Failed to load details.",
        description: "",
      });
    } finally {
      setScheduleModalLoading(false);
    }
  };

  const closeScheduleModal = () => {
    setScheduleModalData({
      open: false,
      title: "",
      type: "",
      content: "",
      description: "",
    });
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

  const logout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  const groupedSchedule = useMemo(() => {
    return scheduleItems.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {} as Record<string, ScheduleItem[]>);
  }, [scheduleItems]);

  const recentProgressPhotos = useMemo(() => {
    return progressPhotos.slice(0, 8);
  }, [progressPhotos]);

  const showPendingPayment =
    hasProfile &&
    applicationStatus === "approved" &&
    paymentStatus === "pending";

  const showCashMessage =
    hasProfile && applicationStatus === "approved" && paymentStatus === "cash";

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.16),_transparent_34%),linear-gradient(to_bottom_right,_#f8fbff,_#eef5ff)] px-6 py-10 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[28px] border border-white/70 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-medium text-slate-500">Loading your dashboard...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,160,255,0.16),_transparent_34%),linear-gradient(to_bottom_right,_#f8fbff,_#eef5ff)] px-6 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
            <div className="bg-gradient-to-r from-[#0f172a] via-[#123b76] to-[#2EA0FF] p-[1px]">
              <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
            </div>

            <div className="p-6 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
                    Wild Atlantic Bootcamp
                  </div>

                  <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                    Welcome back
                  </h1>

                  <p className="mt-3 text-sm text-slate-600 md:text-base">
                    Your training plan, progress updates, and participant profile
                    are all in one place.
                  </p>

                  <div className="mt-5 inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                    {user?.email}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={refreshDashboard}
                    disabled={refreshing}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>

                  <button
                    onClick={logout}
                    className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
                  >
                    Logout
                  </button>
                </div>
              </div>

              {applicationStatus === "approved" &&
                hasProfile &&
                onboardingStatus === "active" && (
                  <div className="mt-8 rounded-[24px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#1d4ed8]">
                          Program status
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-950">
                          Your program is active
                        </h2>
                        <p className="mt-2 text-sm text-slate-600">
                          Your itinerary is ready and your profile is up to date.
                        </p>
                      </div>

                      <div className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Active
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </section>

          {hasProfile && scheduleItems.length > 0 && (
            <section className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Itinerary
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Your Schedule
                  </h2>
                  <p className="mt-2 text-slate-600">
                    Open any item to view the full training, nutrition, or activity
                    details.
                  </p>
                </div>

                {progressPhotosEnabled && (
                  <a
                    href="/dashboard/progress"
                    className="inline-flex items-center justify-center rounded-2xl border border-[#bfdbfe] bg-white px-4 py-2.5 text-sm font-medium text-[#1d4ed8] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93c5fd] hover:bg-[#f8fbff] hover:shadow-md"
                  >
                    View Progress Photos
                  </a>
                )}
              </div>

              <div className="space-y-6">
                {Object.entries(groupedSchedule).map(([date, items]) => (
                  <div
                    key={date}
                    className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur"
                  >
                    <div className="border-b border-slate-100 pb-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {formatDateLabel(date)}
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {date}
                      </h3>
                    </div>

                    <div className="mt-6 space-y-5">
                      {items.map((item, index) => (
                        <div key={item.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="mt-2 h-3 w-3 rounded-full bg-gradient-to-br from-[#2EA0FF] to-[#1B6EDC]" />
                            {index !== items.length - 1 && (
                              <div className="mt-2 h-full w-px bg-gradient-to-b from-[#bfdbfe] to-slate-200" />
                            )}
                          </div>

                          <button
                            onClick={() => openScheduleModal(item)}
                            className="flex-1 rounded-[22px] border border-slate-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#bfdbfe] hover:shadow-md"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <TypeBadge type={item.type} />
                                </div>

                                <p className="mt-3 text-base font-semibold text-slate-900">
                                  {item.displayTitle}
                                </p>
                              </div>

                              <p className="text-sm font-semibold text-slate-700">
                                {item.startTime}
                                {item.endTime ? ` - ${item.endTime}` : ""}
                              </p>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasProfile && scheduleItems.length === 0 && (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Itinerary
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Your Schedule
                  </h2>
                  <p className="mt-2 text-slate-600">
                    Your schedule has not been added yet.
                  </p>
                </div>

                {progressPhotosEnabled && (
                  <a
                    href="/dashboard/progress"
                    className="inline-flex items-center justify-center rounded-2xl border border-[#bfdbfe] bg-white px-4 py-2.5 text-sm font-medium text-[#1d4ed8] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93c5fd] hover:bg-[#f8fbff] hover:shadow-md"
                  >
                    View Progress Photos
                  </a>
                )}
              </div>
            </section>
          )}

          {progressPhotosEnabled && recentProgressPhotos.length > 0 && (
            <section className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Progress
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Your Progress
                  </h2>
                  <p className="mt-2 text-slate-600">
                    Recent uploads from you and your coach.
                  </p>
                </div>

                <a
                  href="/dashboard/progress"
                  className="inline-flex items-center justify-center rounded-2xl border border-[#bfdbfe] bg-white px-4 py-2.5 text-sm font-medium text-[#1d4ed8] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93c5fd] hover:bg-[#f8fbff] hover:shadow-md"
                >
                  Open Full Timeline
                </a>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recentProgressPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => openPhotoModal(photo)}
                    className="rounded-[24px] border border-white/80 bg-white/95 p-3 text-left shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
                  >
                    <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-[18px] bg-slate-100">
                      <img
                        src={photo.imageUrl}
                        alt={photo.title || "Progress photo"}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>

                    <div className="mt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
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
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showPendingPayment && (
            <StatusCard
              title="Payment pending"
              description="Your payment has not been confirmed yet."
              tone="warning"
            />
          )}

          {showCashMessage && (
            <StatusCard
              title="Payment arranged"
              description="Your payment is arranged offline."
              tone="success"
            />
          )}

          {hasProfile && (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Profile
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Profile Overview
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Keep your participant details up to date.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <a
                    href="/dashboard/profile"
                    className="rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    Edit My Profile
                  </a>

                  {progressPhotosEnabled && (
                    <a
                      href="/dashboard/progress"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      Progress Photos
                    </a>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard label="Height" value={height || "Not provided"} />
                <InfoCard label="Weight" value={weight || "Not provided"} />
                <InfoCard label="Allergies" value={allergies || "None provided"} />
                <InfoCard label="Injuries" value={injuries || "None provided"} />
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                <p className="text-sm font-semibold text-slate-700">Notes</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {notes || "No notes provided"}
                </p>
              </div>
            </section>
          )}

          {applicationStatus === "none" && (
            <div className="pt-2">
              <a
                href="/dashboard/application"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                Complete Application
              </a>
            </div>
          )}

          {applicationStatus === "pending" && (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <h2 className="text-xl font-semibold text-slate-950">
                Application submitted
              </h2>
              <p className="mt-2 text-slate-600">
                Your application is under review.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={refreshDashboard}
                  disabled={refreshing}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>

                <a
                  href="/dashboard/application"
                  className="rounded-2xl border border-[#bfdbfe] bg-[#f8fbff] px-4 py-2.5 text-sm font-medium text-[#1d4ed8] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93c5fd] hover:shadow-md"
                >
                  View Application
                </a>
              </div>
            </section>
          )}

          {applicationStatus === "approved" && !hasProfile && (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <h2 className="text-xl font-semibold text-slate-950">Approved</h2>
              <p className="mt-2 text-slate-600">
                Your application has been approved. Your profile will be prepared
                shortly by the team.
              </p>

              <div className="mt-5">
                <button
                  onClick={refreshDashboard}
                  disabled={refreshing}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </section>
          )}

          {applicationStatus === "approved" &&
            hasProfile &&
            onboardingStatus === "incomplete" && (
              <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
                <h2 className="text-xl font-semibold text-slate-950">
                  Complete your profile
                </h2>
                <p className="mt-2 text-slate-600">
                  Please complete your participant profile to continue.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <a
                    href="/dashboard/profile"
                    className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#2EA0FF] to-[#1B6EDC] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    Complete Profile
                  </a>

                  <button
                    onClick={refreshDashboard}
                    disabled={refreshing}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </section>
            )}

          {applicationStatus === "rejected" && (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <h2 className="text-xl font-semibold text-slate-950">
                Application update
              </h2>
              <p className="mt-2 text-slate-600">
                Your application was not approved at this time.
              </p>

              <div className="mt-5">
                <a
                  href="/dashboard/application"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  View Application
                </a>
              </div>
            </section>
          )}
        </div>
      </main>

      {scheduleModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-white/70 bg-white p-6 shadow-[0_30px_100px_rgba(15,23,42,0.20)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                {scheduleModalData.type && (
                  <TypeBadge type={scheduleModalData.type} />
                )}
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  {scheduleModalData.title}
                </h2>
              </div>

              <button
                onClick={closeScheduleModal}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:shadow-sm"
              >
                Close
              </button>
            </div>

            {scheduleModalLoading ? (
              <p className="mt-6 text-slate-600">Loading details...</p>
            ) : (
              <div className="mt-6">
                {scheduleModalData.description && (
                  <p className="mb-4 text-sm text-slate-600">
                    {scheduleModalData.description}
                  </p>
                )}

                <div className="whitespace-pre-line rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 text-sm leading-6 text-slate-800">
                  {scheduleModalData.content}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {photoModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm md:p-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[30px] border border-white/70 bg-white p-4 shadow-[0_30px_100px_rgba(15,23,42,0.25)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
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

function TypeBadge({ type }: { type: ScheduleType }) {
  const styles: Record<ScheduleType, string> = {
    training:
      "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    nutrition:
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    activity:
      "border-violet-200 bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${styles[type]}`}
    >
      {type}
    </span>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{value}</p>
    </div>
  );
}

function StatusCard({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "warning" | "success";
}) {
  const toneStyles =
    tone === "success"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
      : "border-amber-200 bg-gradient-to-br from-amber-50 to-white";

  return (
    <section
      className={`rounded-[28px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] ${toneStyles}`}
    >
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-slate-600">{description}</p>
    </section>
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