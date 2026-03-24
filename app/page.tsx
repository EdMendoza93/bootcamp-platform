"use client";

import { useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function HomePage() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // No logged in → login
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        // No user doc → fallback dashboard
        if (!userSnap.exists()) {
          window.location.replace("/dashboard");
          return;
        }

        const data = userSnap.data() as { role?: string };

        // Admin → admin panel
        if (data.role === "admin") {
          window.location.replace("/admin");
        } else {
          // Client → dashboard
          window.location.replace("/dashboard");
        }
      } catch (error) {
        console.error("Root redirect error:", error);
        window.location.replace("/dashboard");
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="p-10 text-sm text-gray-500">
      Loading...
    </div>
  );
}