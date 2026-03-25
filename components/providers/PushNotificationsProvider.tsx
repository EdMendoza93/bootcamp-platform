"use client";

import { onAuthStateChanged } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
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

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const [pushState, setPushState] = useState<PushState>("checking");
  const [infoMessage, setInfoMessage] = useState("");

  // 🚫 YA NO auto-activa nada
  const checkSupport = useCallback(async () => {
    const supported = await isWebPushSupported();

    if (!supported) {
      setPushState("unsupported");
      setInfoMessage("Push not supported");
      return;
    }

    if (Notification.permission === "denied") {
      setPushState("denied");
      setInfoMessage("Notifications blocked");
      return;
    }

    // 👉 SIEMPRE pedir acción manual
    setPushState("ready");
    setInfoMessage("Enable notifications");
  }, []);

  // ✅ SOLO cuando usuario hace click
  const enablePush = useCallback(async () => {
    const user = auth.currentUser;

    if (!user) {
      setPushState("error");
      setInfoMessage("Login first");
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setPushState("denied");
        setInfoMessage("Permission denied");
        return;
      }

      const token = await getFcmToken();

      await savePushToken(user.uid, token);

      setPushState("enabled");
      setInfoMessage("Notifications enabled");
    } catch (e) {
      console.error(e);
      setPushState("error");
      setInfoMessage("Error enabling push");
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      await checkSupport();

      const supported = await isWebPushSupported();

      if (supported) {
        unsub = subscribeToForegroundMessages((payload: any) => {
          const title = payload?.notification?.title || "Notification";
          const body = payload?.notification?.body || "";

          navigator.serviceWorker.getRegistration().then((reg) => {
            reg?.showNotification(title, { body });
          });
        });
      }
    });

    return () => {
      authUnsub();
      if (unsub) unsub();
    };
  }, [checkSupport]);

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