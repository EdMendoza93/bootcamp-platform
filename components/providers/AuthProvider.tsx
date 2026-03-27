"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { AppRole, normalizeRole } from "@/lib/roles";

type AppUser = {
  uid: string;
  email: string | null;
  name: string | null;
  role: AppRole;
};

type AuthContextType = {
  firebaseUser: User | null;
  appUser: AppUser | null;
  authLoading: boolean;
  profileLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  appUser: null,
  authLoading: true,
  profileLoading: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      setAuthLoading(false);

      if (!currentUser) {
        setAppUser(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data() as Partial<AppUser> & { role?: string };
          setAppUser({
            uid: currentUser.uid,
            email: data.email ?? currentUser.email,
            name: data.name ?? currentUser.displayName ?? "",
            role: normalizeRole(data.role),
          });
        } else {
          setAppUser({
            uid: currentUser.uid,
            email: currentUser.email,
            name: currentUser.displayName || "",
            role: "user",
          });
        }
      } catch (error) {
        console.error("AuthProvider Firestore read error:", error);
        setAppUser({
          uid: currentUser.uid,
          email: currentUser.email,
          name: currentUser.displayName || "",
          role: normalizeRole("user"),
        });
      } finally {
        setProfileLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      firebaseUser,
      appUser,
      authLoading,
      profileLoading,
    }),
    [firebaseUser, appUser, authLoading, profileLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
