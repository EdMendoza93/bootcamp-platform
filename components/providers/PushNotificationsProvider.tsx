"use client";

import { onAuthStateChanged } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  disablePushTokens,
  getFcmToken,
  isWebPushSupported,
  subscribeToForegroundMessages,
  upsertPushToken,
} from "@/lib/push";

type PushState =
  | "checking"
  | "unsupported"
  | "ios-needs-home-screen"
  | "denied"
  | "ready-to-enable"
  | "enabled"
  | "error";

type PushContextType = {
  pushState: PushState;
  enablePush: () => Promise<void>;
  infoMessage: string;
};

const PushContext = createContext<PushContextType>({
  pushState: "checking",
  enablePush: async () => {},
  infoMessage: "Checking push support...",
});

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;

  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const [pushState, setPushState] = useState<PushState>("checking");
  const [infoMessage, setInfoMessage] = useState("Checking push support...");

  const syncPushToken = useCallback(async (uid: string) => {
    const supported = await isWebPushSupported();

    if (!supported) {
      if (isIos() && !isStandalone()) {
        setPushState("ios-needs-home-screen");
        setInfoMessage("On iPhone/iPad, push is only available after adding this app to the Home Screen.");
      } else {
        setPushState("unsupported");
        setInfoMessage("Push notifications are not supported in this browser/device combination.");
      }

      await disablePushTokens(uid);
      return;
    }

    if (Notification.permission === "granted") {
      const token = await getFcmToken();

      if (!token) {
        setPushState("error");
        setInfoMessage("Push token is unavailable. Please try again.");
        return;
      }

      await upsertPushToken(uid, token);
      setPushState("enabled");
      setInfoMessage("Push notifications are enabled.");
      return;
    }

    if (Notification.permission === "denied") {
      setPushState("denied");
      setInfoMessage("Push permission is blocked. Enable notifications in browser settings.");
      return;
    }

    setPushState("ready-to-enable");
    setInfoMessage("Enable push notifications to receive updates from admins.");
  }, []);

  const enablePush = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setPushState("error");
      setInfoMessage("Sign in first to enable notifications.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "ready-to-enable");
        setInfoMessage(
          permission === "denied"
            ? "Push permission is blocked. Enable it from browser settings."
            : "Permission not granted. You can enable push later."
        );
        return;
      }

      const token = await getFcmToken();

      if (!token) {
        setPushState("error");
        setInfoMessage("Push token is unavailable. Please try again.");
        return;
      }

      await upsertPushToken(currentUser.uid, token);
      setPushState("enabled");
      setInfoMessage("Push notifications are enabled.");
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
        setInfoMessage("Sign in to manage push notifications.");

        if (unsubscribeForeground) {
          unsubscribeForeground();
          unsubscribeForeground = null;
        }

        return;
      }

      try {
        await syncPushToken(user.uid);

        const supported = await isWebPushSupported();

        if (supported) {
          unsubscribeForeground = subscribeToForegroundMessages((payload: unknown) => {
            const message = payload as {
              notification?: { title?: string; body?: string };
              data?: { url?: string };
            };

            const title = message.notification?.title || "Wild Atlantic Bootcamp";
            const body = message.notification?.body || "You have a new update.";
            const link = message.data?.url || "/dashboard";

            if (Notification.permission === "granted") {
              navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js").then((registration) => {
                if (registration) {
                  registration.showNotification(title, {
                    body,
                    data: { url: link },
                    icon: "/icon.png",
                    badge: "/icon.png",
                  });
                }
              });
            }
          });
        }
      } catch (error) {
        console.error("Push sync error:", error);
        setPushState("error");
        setInfoMessage("Failed to initialize push support.");
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeForeground) unsubscribeForeground();
    };
  }, [syncPushToken]);

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
