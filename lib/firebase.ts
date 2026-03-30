import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

function resolveAuthDomain() {
  if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) {
    return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  }

  return "app.bootcamp.rivcor.com";
}

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyAc9WUQzLLGXdjCXXpvi7paqTFRHwc0E5M",
  authDomain: resolveAuthDomain(),
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bootcamp-platform-27d16",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "bootcamp-platform-27d16.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "780790284759",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:780790284759:web:b5bc273be0392d60ff8b92",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-Q9M4V6XK1R",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");
export const googleProvider = new GoogleAuthProvider();
