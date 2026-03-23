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

  const [progressPhotosEnabled, setProgressPhotosEnabled] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<
    "pending" | "approved" | "rejected" | "none"
  >("none");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const profileSnap = await getDocs(
          query(collection(db, "profiles"), where("userId", "==", user.uid))
        );

        if (!profileSnap.empty) {
          const profileDoc = profileSnap.docs[0];
          const pid = profileDoc.id;
          const data = profileDoc.data() as {
            progressPhotosEnabled?: boolean;
            approvalStatus?: "pending" | "approved" | "rejected";
          };

          setProfileId(pid);
          setProgressPhotosEnabled(data.progressPhotosEnabled === true);
          setApprovalStatus(data.approvalStatus || "none");

          const photosSnap = await getDocs(
            query(collection(db, "progressPhotos"), where("profileId", "==", pid))
          );

          const photoData = photosSnap.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as Omit<Photo, "id">),
          }));

          setPhotos(photoData.reverse());
        }
      } catch (error) {
        console.error("Load progress error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const uploadLockedByApproval = approvalStatus !== "approved";

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
      <section className="rounded-[32px] border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Your Progress</h1>
        <p className="mt-2 text-gray-600">
          Track your transformation over time.
        </p>
      </section>

      {uploadLockedByApproval ? (
        <section className="rounded-[32px] border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Progress photos will unlock soon
          </h2>
          <p className="mt-2 text-gray-600">
            You’ll be able to upload progress photos once your profile has been approved.
          </p>
        </section>
      ) : !progressPhotosEnabled ? (
        <section className="rounded-[32px] border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Uploads not enabled yet</h2>
          <p className="mt-2 text-gray-600">
            Your coach has not enabled progress photos for your profile yet.
          </p>
        </section>
      ) : (
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
      )}

      <section className="rounded-[32px] border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Your Photo Timeline</h2>
        <p className="mt-2 text-gray-600">
          A visual timeline of your progress updates.
        </p>

        {photos.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed p-10 text-center text-sm text-gray-500">
            No photos yet. Start your journey today.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="rounded-2xl border p-3">
                <img src={photo.imageUrl} className="rounded-xl" alt="" />

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