"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  canRoleAccessThread,
  filterVisibleThreads,
  MessageThreadRecord,
} from "@/lib/messages";

export function useUnreadMessageCount() {
  const { firebaseUser, appUser, authLoading, profileLoading } = useAuth();
  const [count, setCount] = useState(0);

  const loading = authLoading || profileLoading;
  const role = appUser?.role || "user";
  const uid = firebaseUser?.uid || "";

  useEffect(() => {
    const load = async () => {
      if (loading || !firebaseUser || !appUser) {
        if (!loading) {
          setCount(0);
        }
        return;
      }

      try {
        const [threadsSnap, hiddenThreadsSnap] = await Promise.all([
          getDocs(collection(db, "messageThreads")),
          getDocs(collection(db, "users", uid, "hiddenThreads")),
        ]);
        const hiddenThreadIds = new Set(hiddenThreadsSnap.docs.map((docItem) => docItem.id));
        const threads = filterVisibleThreads(
          threadsSnap.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as Omit<MessageThreadRecord, "id">),
          })) as MessageThreadRecord[],
          hiddenThreadIds
        );

        const unreadCount = threads.filter((thread) => {
          if (!canRoleAccessThread(thread, role, uid)) return false;
          if (thread.lastSenderRole === role && role !== "user") return false;
          if (role === "user" && thread.lastSenderRole === "user") return false;
          return !thread.readByUserIds?.includes(uid);
        }).length;

        setCount(unreadCount);
      } catch (error) {
        console.error("Unread message count error:", error);
      }
    };

    void load();
  }, [appUser, firebaseUser, loading, role, uid]);

  return useMemo(() => count, [count]);
}
