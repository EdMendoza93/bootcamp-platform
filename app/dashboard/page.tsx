"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

type Profile = {
  id: string;
  fullName?: string;
  assignedProgram?: string;
  paymentStatus?: string;
  onboardingStatus?: string;
  approvalStatus?: string;
};

type ScheduleItem = {
  id: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: string;
  title?: string;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        // GET PROFILE
        const profileQuery = query(
          collection(db, "profiles"),
          where("userId", "==", user.uid)
        );

        const profileSnap = await getDocs(profileQuery);

        if (!profileSnap.empty) {
          const profileDoc = profileSnap.docs[0];
          const profileData = {
            id: profileDoc.id,
            ...(profileDoc.data() as Omit<Profile, "id">),
          };

          setProfile(profileData);

          // GET SCHEDULE
          const scheduleQuery = query(
            collection(db, "scheduleItems"),
            where("profileId", "==", profileDoc.id)
          );

          const scheduleSnap = await getDocs(scheduleQuery);

          const scheduleData = scheduleSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<ScheduleItem, "id">),
          }));

          setSchedule(scheduleData);
        }
      } catch (error) {
        console.error("Dashboard load error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const groupedSchedule = useMemo(() => {
    return schedule.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {} as Record<string, ScheduleItem[]>);
  }, [schedule]);

  if (loading) {
    return (
      <div className="p-10 text-sm text-gray-500">Loading your dashboard...</div>
    );
  }

  return (
    <div className="space-y-8">
      {/* HERO */}
      <section className="rounded-[32px] border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">
          Welcome back{profile?.fullName ? `, ${profile.fullName}` : ""}
        </h1>

        <p className="mt-3 text-gray-600">
          Here's your current progress and upcoming plan.
        </p>
      </section>

      {/* STATUS */}
      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard label="Program" value={profile?.assignedProgram || "Not assigned"} />
        <StatusCard label="Payment" value={profile?.paymentStatus || "Pending"} />
        <StatusCard label="Profile" value={profile?.onboardingStatus || "Incomplete"} />
      </section>

      {/* SCHEDULE */}
      <section className="rounded-[32px] border bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold">Your Schedule</h2>

        {schedule.length === 0 ? (
          <p className="mt-4 text-gray-500">
            No schedule yet. Your coach will assign your plan soon.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {Object.entries(groupedSchedule).map(([date, items]) => (
              <div key={date}>
                <h3 className="font-semibold">{date}</h3>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border bg-gray-50 p-4"
                    >
                      <p className="text-sm text-gray-500">
                        {item.startTime}
                        {item.endTime ? ` - ${item.endTime}` : ""}
                      </p>

                      <p className="mt-2 font-medium">
                        {item.title || "Session"}
                      </p>

                      <span className="mt-2 inline-block rounded-full border px-3 py-1 text-xs">
                        {item.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}