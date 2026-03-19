"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";

type ApplicationStatus = "none" | "pending" | "approved" | "rejected";
type OnboardingStatus = "none" | "incomplete" | "active";

type ScheduleItem = {
  id: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: "training" | "nutrition" | "activity" | "other";
  templateId?: string;
  title?: string;
  details?: string;
  displayTitle: string;
};

type ModalData = {
  open: boolean;
  title: string;
  type: string;
  content: string;
  description: string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [applicationStatus, setApplicationStatus] =
    useState<ApplicationStatus>("none");
  const [hasProfile, setHasProfile] = useState(false);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus>("none");
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [assignedProgram, setAssignedProgram] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [allergies, setAllergies] = useState("");
  const [injuries, setInjuries] = useState("");
  const [notes, setNotes] = useState("");
  const [trainingPlanTitle, setTrainingPlanTitle] = useState("");
  const [trainingPlanDetails, setTrainingPlanDetails] = useState("");
  const [nutritionPlanTitle, setNutritionPlanTitle] = useState("");
  const [nutritionPlanDetails, setNutritionPlanDetails] = useState("");
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [modalData, setModalData] = useState<ModalData>({
    open: false,
    title: "",
    type: "",
    content: "",
    description: "",
  });
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveTemplateTitle = async (
      type: ScheduleItem["type"],
      templateId?: string
    ) => {
      if (!templateId) return "";

      let collectionName = "";
      if (type === "training") collectionName = "trainingTemplates";
      if (type === "nutrition") collectionName = "nutritionTemplates";
      if (type === "activity" || type === "other") {
        collectionName = "activityTemplates";
      }
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
      try {
        await auth.authStateReady();

        const currentUser = auth.currentUser;

        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        if (cancelled) return;
        setUser(currentUser);

        const userQuery = await getDocs(
          query(collection(db, "users"), where("uid", "==", currentUser.uid))
        );

        if (!userQuery.empty) {
          const userData = userQuery.docs[0].data() as { role?: string };
          if (!cancelled) setIsAdmin(userData.role === "admin");
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
          if (!cancelled) setApplicationStatus(appData.status || "none");
        }

        const profileQuery = await getDocs(
          query(
            collection(db, "profiles"),
            where("userId", "==", currentUser.uid)
          )
        );

        if (!profileQuery.empty) {
          const profileDoc = profileQuery.docs[0];
          const profileData = profileDoc.data() as {
            onboardingStatus?: OnboardingStatus;
            paymentStatus?: string;
            assignedProgram?: string;
            height?: string;
            weight?: string;
            allergies?: string;
            injuries?: string;
            notes?: string;
            trainingPlanTitle?: string;
            trainingPlanDetails?: string;
            nutritionPlanTitle?: string;
            nutritionPlanDetails?: string;
          };

          if (!cancelled) {
            setHasProfile(true);
            setOnboardingStatus(profileData.onboardingStatus || "none");
            setPaymentStatus(profileData.paymentStatus || "pending");
            setAssignedProgram(profileData.assignedProgram || "");
            setHeight(profileData.height || "");
            setWeight(profileData.weight || "");
            setAllergies(profileData.allergies || "");
            setInjuries(profileData.injuries || "");
            setNotes(profileData.notes || "");
            setTrainingPlanTitle(profileData.trainingPlanTitle || "");
            setTrainingPlanDetails(profileData.trainingPlanDetails || "");
            setNutritionPlanTitle(profileData.nutritionPlanTitle || "");
            setNutritionPlanDetails(profileData.nutritionPlanDetails || "");
          }

          const scheduleQuery = await getDocs(
            query(
              collection(db, "scheduleItems"),
              where("profileId", "==", profileDoc.id)
            )
          );

          const rawItems = scheduleQuery.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<ScheduleItem, "id" | "displayTitle">),
          }));

          const resolved = await Promise.all(
            rawItems.map(async (item) => {
              const templateTitle = await resolveTemplateTitle(
                item.type,
                item.templateId
              );
              return {
                ...item,
                displayTitle:
                  item.title || templateTitle || "Untitled item",
              } as ScheduleItem;
            })
          );

          resolved.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.startTime.localeCompare(b.startTime);
          });

          if (!cancelled) setScheduleItems(resolved);
        }
      } catch (error) {
        console.error("Dashboard error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const openScheduleModal = async (item: ScheduleItem) => {
    setModalLoading(true);
    setModalData({
      open: true,
      title: item.displayTitle,
      type: item.type,
      content: "",
      description: "",
    });

    try {
      if (!item.templateId) {
        setModalData({
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
      if (item.type === "activity" || item.type === "other") {
        collectionName = "activityTemplates";
      }

      if (!collectionName) {
        setModalData({
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
        setModalData({
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

      setModalData({
        open: true,
        title: data.title || item.displayTitle,
        type: item.type,
        description: data.description || "",
        content: combinedContent,
      });
    } catch (error) {
      console.error("Open modal error:", error);
      setModalData({
        open: true,
        title: item.displayTitle,
        type: item.type,
        content: "Failed to load details.",
        description: "",
      });
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalData({
      open: false,
      title: "",
      type: "",
      content: "",
      description: "",
    });
  };

  const logout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  const groupedSchedule = scheduleItems.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {} as Record<string, ScheduleItem[]>);

  if (loading) {
    return <p className="p-10">Loading...</p>;
  }

  return (
    <>
      <main className="min-h-screen bg-white p-10">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-gray-600">{user?.email}</p>

        {isAdmin && (
          <a
            href="/admin"
            className="mt-6 inline-block rounded bg-black px-4 py-2 text-white"
          >
            Go to Admin
          </a>
        )}

        {!isAdmin && hasProfile && scheduleItems.length > 0 && (
          <section className="mt-8">
            <h2 className="text-2xl font-semibold">Your Itinerary</h2>
            <p className="mt-2 text-gray-600">
              Your upcoming schedule and activities.
            </p>

            <div className="mt-6 space-y-6">
              {Object.entries(groupedSchedule).map(([date, items]) => (
                <div key={date} className="rounded-xl border p-6">
                  <h3 className="text-lg font-semibold">{date}</h3>

                  <div className="mt-4 space-y-3">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openScheduleModal(item)}
                        className="w-full rounded-lg border bg-gray-50 p-4 text-left transition hover:bg-gray-100"
                      >
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium">{item.displayTitle}</p>
                            <p className="text-sm uppercase text-gray-600">
                              {item.type}
                            </p>
                          </div>

                          <p className="text-sm text-gray-700">
                            {item.startTime}
                            {item.endTime ? ` - ${item.endTime}` : ""}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isAdmin && hasProfile && scheduleItems.length === 0 && (
          <section className="mt-8 rounded-xl border p-6">
            <h2 className="text-xl font-semibold">Your Itinerary</h2>
            <p className="mt-2 text-gray-600">
              Your schedule has not been added yet.
            </p>
          </section>
        )}

        <p className="mt-8 text-gray-600">
          Application Status: {applicationStatus}
        </p>

        {hasProfile && (
          <>
            <p className="mt-2 text-gray-600">
              Profile Status: {onboardingStatus}
            </p>
            <p className="mt-2 text-gray-600">
              Payment Status: {paymentStatus}
            </p>
            <p className="mt-2 text-gray-600">
              Personalized Plan: {assignedProgram || "Not assigned yet"}
            </p>
          </>
        )}

        <div className="mt-4">
          {!isAdmin &&
            applicationStatus !== "approved" &&
            applicationStatus !== "pending" && (
              <a
                href="/dashboard/application"
                className="inline-block rounded border px-4 py-2"
              >
                Complete Application
              </a>
            )}
        </div>

        {!isAdmin && applicationStatus === "pending" && (
          <div className="mt-6 rounded-xl border p-6">
            <h2 className="text-xl font-semibold">Application submitted</h2>
            <p className="mt-2 text-gray-600">
              Your application is under review.
            </p>
          </div>
        )}

        {!isAdmin && applicationStatus === "approved" && !hasProfile && (
          <div className="mt-6 rounded-xl border p-6">
            <h2 className="text-xl font-semibold">Approved</h2>
            <p className="mt-2 text-gray-600">
              Your application has been approved. Your profile will be prepared
              shortly by the team.
            </p>
          </div>
        )}

        {!isAdmin &&
          applicationStatus === "approved" &&
          hasProfile &&
          onboardingStatus === "incomplete" && (
            <div className="mt-6 rounded-xl border p-6">
              <h2 className="text-xl font-semibold">Complete your profile</h2>
              <p className="mt-2 text-gray-600">
                Please complete your participant profile to continue.
              </p>

              <div className="mt-4 flex gap-3">
                <a
                  href="/dashboard/profile"
                  className="inline-block rounded bg-black px-4 py-2 text-white"
                >
                  Complete Profile
                </a>

                <a
                  href="/dashboard/profile"
                  className="inline-block rounded border px-4 py-2"
                >
                  Edit My Profile
                </a>
              </div>
            </div>
          )}

        {!isAdmin &&
          applicationStatus === "approved" &&
          hasProfile &&
          onboardingStatus === "active" && (
            <div className="mt-6 space-y-6">
              <div className="rounded-xl border p-6">
                <h2 className="text-xl font-semibold">Welcome to the program</h2>
                <p className="mt-2 text-gray-600">
                  You now have access to your next steps, training, nutrition,
                  and bookings.
                </p>
              </div>

              <div className="rounded-xl border p-6">
                <h3 className="text-lg font-semibold">Your Profile Overview</h3>

                <div className="mt-4 space-y-2 text-sm text-gray-700">
                  <p>
                    <span className="font-medium">Height:</span>{" "}
                    {height || "Not provided"}
                  </p>
                  <p>
                    <span className="font-medium">Weight:</span>{" "}
                    {weight || "Not provided"}
                  </p>
                  <p>
                    <span className="font-medium">Allergies:</span>{" "}
                    {allergies || "None provided"}
                  </p>
                  <p>
                    <span className="font-medium">Injuries:</span>{" "}
                    {injuries || "None provided"}
                  </p>
                  <p>
                    <span className="font-medium">Notes:</span>{" "}
                    {notes || "No notes provided"}
                  </p>
                </div>

                <a
                  href="/dashboard/profile"
                  className="mt-4 inline-block rounded border px-4 py-2"
                >
                  Edit My Profile
                </a>
              </div>

              {(trainingPlanTitle || trainingPlanDetails) && (
                <div className="rounded-xl border p-6">
                  <h3 className="text-lg font-semibold">
                    {trainingPlanTitle || "Training Plan"}
                  </h3>
                  <p className="mt-4 whitespace-pre-line text-sm text-gray-700">
                    {trainingPlanDetails || "No training details yet."}
                  </p>
                </div>
              )}

              {(nutritionPlanTitle || nutritionPlanDetails) && (
                <div className="rounded-xl border p-6">
                  <h3 className="text-lg font-semibold">
                    {nutritionPlanTitle || "Nutrition Plan"}
                  </h3>
                  <p className="mt-4 whitespace-pre-line text-sm text-gray-700">
                    {nutritionPlanDetails || "No nutrition details yet."}
                  </p>
                </div>
              )}
            </div>
          )}

        {!isAdmin && applicationStatus === "rejected" && (
          <div className="mt-6 rounded-xl border p-6">
            <h2 className="text-xl font-semibold">Application update</h2>
            <p className="mt-2 text-gray-600">
              Your application was not approved at this time.
            </p>
          </div>
        )}

        <button
          onClick={logout}
          className="mt-6 block rounded bg-gray-200 px-4 py-2"
        >
          Logout
        </button>
      </main>

      {modalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  {modalData.type}
                </p>
                <h2 className="mt-2 text-2xl font-bold">{modalData.title}</h2>
              </div>

              <button
                onClick={closeModal}
                className="rounded border px-3 py-2 text-sm"
              >
                Close
              </button>
            </div>

            {modalLoading ? (
              <p className="mt-6 text-gray-600">Loading details...</p>
            ) : (
              <div className="mt-6">
                {modalData.description && (
                  <p className="mb-4 text-sm text-gray-600">
                    {modalData.description}
                  </p>
                )}

                <div className="whitespace-pre-line rounded-xl border bg-gray-50 p-4 text-sm text-gray-800">
                  {modalData.content}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}