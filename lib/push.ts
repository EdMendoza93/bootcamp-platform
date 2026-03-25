"use client";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { app, db } from "@/lib/firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

export async function isWebPushSupported() {
  if (typeof window === "undefined") return false;

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return false;
  }

  return isSupported();
}

export async function registerMessagingServiceWorker() {
  if (typeof window === "undefined") return null;
  return navigator.serviceWorker.register("/firebase-messaging-sw.js");
}

export async function getFcmToken() {
  if (!VAPID_KEY) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY");
  }

  const registration = await registerMessagingServiceWorker();
  if (!registration) {
    throw new Error("Service worker registration failed");
  }

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  return token;
}

export async function upsertPushToken(uid: string, token: string) {
  const docId = token.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);

  await setDoc(
    doc(db, "users", uid, "pushTokens", docId),
    {
      token,
      enabled: true,
      permission: Notification.permission,
      platform: navigator.platform || "unknown",
      userAgent: navigator.userAgent || "unknown",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function disablePushTokens(uid: string) {
  await setDoc(
    doc(db, "users", uid, "pushState", "status"),
    {
      permission: Notification.permission,
      pushSupported: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeToForegroundMessages(onPayload: (payload: unknown) => void) {
  const messaging = getMessaging(app);
  return onMessage(messaging, onPayload);
}
