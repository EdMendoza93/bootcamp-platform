"use client";

import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  getFcmToken,
  isWebPushSupported,
  savePushToken,
  subscribeToForegroundMessages,
} from "@/lib/push";

type PushState =
  | "checking"
  | "unsupported"
  | "ready"
  | "enabled"
  | "hidden"
  | "denied"
  | "error";

type PushContextType = {
  pushState: PushState;
  enablePush: () => Promise<void>;
  infoMessage: string;
};

const PushContext = createContext<PushContextType>({
  pushState: "checking",
  enablePush: async () => {},
  infoMessage: "",
});

async function hasEnabledPushToken(uid: string) {
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "pushTokens"),
      where("enabled", "==", true)
    )
  );

  return !snap.empty;
}

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const [pushState, setPushState] = useState<PushState>("checking");
  const [infoMessage, setInfoMessage] = useState("Checking push notifications...");

  const checkPushState = useCallback(async (uid: string) => {
    const supported = await isWebPushSupported();

    if (!supported) {
      setPushState("unsupported");
      setInfoMessage("Push notifications are not supported on this device/browser.");
      return;
    }

    if (Notification.permission === "denied") {
      setPushState("denied");
      setInfoMessage("Notifications are blocked in browser settings.");
      return;
    }

    const alreadyEnabled = await hasEnabledPushToken(uid);

    if (alreadyEnabled) {
      setPushState("hidden");
      setInfoMessage("");
      return;
    }

    setPushState("ready");
    setInfoMessage("Enable push notifications to receive updates.");
  }, []);

  const enablePush = useCallback(async () => {
    const user = auth.currentUser;

    if (!user) {
      setPushState("error");
      setInfoMessage("You must be signed in first.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setPushState("denied");
        setInfoMessage("Notifications permission was denied.");
        return;
      }

      const token = await getFcmToken();
      await savePushToken(user.uid, token);

      setPushState("enabled");
      setInfoMessage("Push notifications are enabled.");

      window.setTimeout(() => {
        setPushState("hidden");
        setInfoMessage("");
      }, 2500);
    } catch (error) {
      console.error("Enable push error:", error);
      setPushState("error");
      setInfoMessage("Failed to enable push notifications.");
    }
  }, []);

  useEffect(() => {
    let unsubscribeForeground: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPushState("checking");
        setInfoMessage("Checking push notifications...");
        return;
      }

      try {
        await checkPushState(user.uid);

        const supported = await isWebPushSupported();

        if (supported) {
          unsubscribeForeground = subscribeToForegroundMessages((payload: unknown) => {
            const messagePayload = payload as {
              data?: {
                title?: string;
                body?: string;
                url?: string;
              };
            };
            const title = messagePayload?.data?.title || "Wild Atlantic Bootcamp";
            const body = messagePayload?.data?.body || "You have a new notification.";
            const url = messagePayload?.data?.url || "/dashboard";

            navigator.serviceWorker.getRegistration().then((registration) => {
              if (registration && Notification.permission === "granted") {
                registration.showNotification(title, {
                  body,
                  icon: "/icon.png",
                  badge: "/icon.png",
                  data: { url },
                });
              }
            });
          });
        }
      } catch (error) {
        console.error("Push init error:", error);
        setPushState("error");
        setInfoMessage("Failed to initialize push notifications.");
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeForeground) unsubscribeForeground();
    };
  }, [checkPushState]);

  const value = useMemo(
    () => ({
      pushState,
      enablePush,
      infoMessage,
    }),
    [pushState, enablePush, infoMessage]
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePushNotifications() {
  return useContext(PushContext);
}
