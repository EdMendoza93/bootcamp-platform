"use client";

import { useEffect, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

type Photo = {
  id: string;
  imageUrl: string;
  title?: string;
  note?: string;
  createdAt?: any;
};

export default function ProgressPage() {
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

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
          const pid = profileDoc.id;
          setProfileId(pid);

          // GET PHOTOS
          const photosQuery = query(
            collection(db, "progressPhotos"),
            where("profileId", "==", pid)
          );

          const photosSnap = await getDocs(photosQuery);

          const data = photosSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<Photo, "id">),
          }));

          setPhotos(data.reverse());
        }
      } catch (error) {
        console.error("Load progress error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const uploadPhoto = async () => {
    if (!file || !profileId) return;

    setUploading(true);

    try {
      const fileRef = ref(
        storage,
        `progress/${profileId}/${Date.now()}-${file.name}`
      );

      await uploadBytes(fileRef, file);
      const imageUrl = await getDownloadURL(fileRef);

      await addDoc(collection(db, "progressPhotos"), {
        profileId,
        imageUrl,
        title,
        note,
        uploadedByRole: "user",
        createdAt: serverTimestamp(),
      });

      setFile(null);
      setTitle("");
      setNote("");

      window.location.reload();
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <p className="p-10 text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <section className="rounded-[32px] border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Your Progress</h1>
        <p className="mt-2 text-gray-600">
          Track your transformation over time.
        </p>
      </section>

      {/* UPLOAD */}
      <section className="rounded-[32px] border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Upload new photo</h2>

        <div className="mt-4 space-y-3">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border p-3"
          />

          <textarea
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border p-3"
          />

          <button
            onClick={uploadPhoto}
            disabled={uploading}
            className="rounded-xl bg-black px-6 py-3 text-white"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </section>

      {/* GALLERY */}
      <section className="rounded-[32px] border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Your Photos</h2>

        {photos.length === 0 ? (
          <p className="mt-4 text-gray-500">
            No photos yet. Start your journey today.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="rounded-2xl border p-3">
                <img
                  src={photo.imageUrl}
                  className="rounded-xl"
                  alt=""
                />

                <p className="mt-2 font-medium">
                  {photo.title || "Progress"}
                </p>

                {photo.note && (
                  <p className="text-sm text-gray-600">{photo.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}