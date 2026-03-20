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
    return <p className="p-10">Loading...</p>;
  }

  return (
    <>
      <main className="min-h-screen bg-gray-50 p-6 md:p-10">
        <div className="mx-auto max-w-6xl">
          <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                  Wild Atlantic Bootcamp
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                  Welcome back
                </h1>
                <p className="mt-3 text-gray-600">{user?.email}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={refreshDashboard}
                  disabled={refreshing}
                  className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>

                <button
                  onClick={logout}
                  className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>

            {applicationStatus === "approved" &&
              hasProfile &&
              onboardingStatus === "active" && (
                <div className="mt-8 rounded-2xl bg-gray-50 p-5">
                  <h2 className="text-lg font-semibold">Your program is active</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Your itinerary is ready and your profile is up to date.
                  </p>
                </div>
              )}
          </section>

          {hasProfile && scheduleItems.length > 0 && (
            <section className="mt-8">
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Your Itinerary
                  </h2>
                  <p className="mt-2 text-gray-600">
                    Tap any item to see the full details.
                  </p>
                </div>

                {progressPhotosEnabled && (
                  <a
                    href="/dashboard/progress"
                    className="inline-flex rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
                  >
                    View Progress Photos
                  </a>
                )}
              </div>

              <div className="space-y-6">
                {Object.entries(groupedSchedule).map(([date, items]) => (
                  <div
                    key={date}
                    className="rounded-3xl border bg-white p-6 shadow-sm"
                  >
                    <div className="border-b pb-4">
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                        {formatDateLabel(date)}
                      </p>
                      <h3 className="mt-2 text-2xl font-bold tracking-tight">
                        {date}
                      </h3>
                    </div>

                    <div className="mt-6 space-y-5">
                      {items.map((item, index) => (
                        <div key={item.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="mt-2 h-3 w-3 rounded-full bg-black" />
                            {index !== items.length - 1 && (
                              <div className="mt-2 h-full w-px bg-gray-200" />
                            )}
                          </div>

                          <button
                            onClick={() => openScheduleModal(item)}
                            className="flex-1 rounded-2xl border bg-gray-50 p-4 text-left transition hover:bg-gray-100"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <TypeBadge type={item.type} />
                                </div>

                                <p className="mt-3 text-base font-semibold">
                                  {item.displayTitle}
                                </p>
                              </div>

                              <p className="text-sm font-medium text-gray-700">
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
            <section className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Your Itinerary</h2>
                  <p className="mt-2 text-gray-600">
                    Your schedule has not been added yet.
                  </p>
                </div>

                {progressPhotosEnabled && (
                  <a
                    href="/dashboard/progress"
                    className="inline-flex rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
                  >
                    View Progress Photos
                  </a>
                )}
              </div>
            </section>
          )}

          {progressPhotosEnabled && recentProgressPhotos.length > 0 && (
            <section className="mt-8">
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Your Progress
                  </h2>
                  <p className="mt-2 text-gray-600">
                    Recent uploads from you and your coach.
                  </p>
                </div>

                <a
                  href="/dashboard/progress"
                  className="inline-flex rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
                >
                  Open Full Timeline
                </a>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recentProgressPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => openPhotoModal(photo)}
                    className="rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                      <img
                        src={photo.imageUrl}
                        alt={photo.title || "Progress photo"}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>

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
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showPendingPayment && (
            <section className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Payment pending</h2>
              <p className="mt-2 text-gray-600">
                Your payment has not been confirmed yet.
              </p>
            </section>
          )}

          {showCashMessage && (
            <section className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Payment arranged</h2>
              <p className="mt-2 text-gray-600">
                Your payment is arranged offline.
              </p>
            </section>
          )}

          {hasProfile && (
            <section className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Profile Overview</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Keep your participant details up to date.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <a
                    href="/dashboard/profile"
                    className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
                  >
                    Edit My Profile
                  </a>

                  {progressPhotosEnabled && (
                    <a
                      href="/dashboard/progress"
                      className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
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

              <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-700">Notes</p>
                <p className="mt-2 text-sm text-gray-600">
                  {notes || "No notes provided"}
                </p>
              </div>
            </section>
          )}

          {applicationStatus === "none" && (
            <div className="mt-8">
              <a
                href="/dashboard/application"
                className="inline-block rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
              >
                Complete Application
              </a>
            </div>
          )}

          {applicationStatus === "pending" && (
            <div className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Application submitted</h2>
              <p className="mt-2 text-gray-600">
                Your application is under review.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={refreshDashboard}
                  disabled={refreshing}
                  className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>

                <a
                  href="/dashboard/application"
                  className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
                >
                  View Application
                </a>
              </div>
            </div>
          )}

          {applicationStatus === "approved" && !hasProfile && (
            <div className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Approved</h2>
              <p className="mt-2 text-gray-600">
                Your application has been approved. Your profile will be prepared
                shortly by the team.
              </p>

              <div className="mt-4">
                <button
                  onClick={refreshDashboard}
                  disabled={refreshing}
                  className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
          )}

          {applicationStatus === "approved" &&
            hasProfile &&
            onboardingStatus === "incomplete" && (
              <div className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Complete your profile</h2>
                <p className="mt-2 text-gray-600">
                  Please complete your participant profile to continue.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href="/dashboard/profile"
                    className="inline-block rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Complete Profile
                  </a>

                  <button
                    onClick={refreshDashboard}
                    disabled={refreshing}
                    className="rounded-xl border bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>
            )}

          {applicationStatus === "rejected" && (
            <div className="mt-8 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Application update</h2>
              <p className="mt-2 text-gray-600">
                Your application was not approved at this time.
              </p>

              <div className="mt-4">
                <a
                  href="/dashboard/application"
                  className="inline-block rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
                >
                  View Application
                </a>
              </div>
            </div>
          )}
        </div>
      </main>

      {scheduleModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                {scheduleModalData.type && (
                  <TypeBadge type={scheduleModalData.type} />
                )}
                <h2 className="mt-3 text-2xl font-bold tracking-tight">
                  {scheduleModalData.title}
                </h2>
              </div>

              <button
                onClick={closeScheduleModal}
                className="rounded-xl border bg-white px-3 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>

            {scheduleModalLoading ? (
              <p className="mt-6 text-gray-600">Loading details...</p>
            ) : (
              <div className="mt-6">
                {scheduleModalData.description && (
                  <p className="mb-4 text-sm text-gray-600">
                    {scheduleModalData.description}
                  </p>
                )}

                <div className="whitespace-pre-line rounded-2xl bg-gray-50 p-4 text-sm text-gray-800">
                  {scheduleModalData.content}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

function TypeBadge({ type }: { type: ScheduleType }) {
  return (
    <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-800">
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
    <div className="rounded-2xl bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-2 text-sm text-gray-600">{value}</p>
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