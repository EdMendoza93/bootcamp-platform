import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();

const db = getFirestore();

function assertAdmin(auth) {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  return db
    .collection("users")
    .doc(auth.uid)
    .get()
    .then((snap) => {
      const role = snap.exists ? snap.data()?.role : null;

      if (role !== "admin") {
        throw new HttpsError("permission-denied", "Admin role required.");
      }
    });
}

export const sendPushNotification = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const title = String(request.data?.title || "").trim();
      const body = String(request.data?.body || "").trim();
      const url = String(request.data?.url || "/dashboard").trim() || "/dashboard";
      const audience = request.data?.audience === "selected" ? "selected" : "all";
      const selectedUserIds = Array.isArray(request.data?.selectedUserIds)
        ? request.data.selectedUserIds.filter((item) => typeof item === "string")
        : [];

      if (!title || !body) {
        throw new HttpsError("invalid-argument", "title and body are required.");
      }

      if (audience === "selected" && selectedUserIds.length === 0) {
        throw new HttpsError(
          "invalid-argument",
          "selectedUserIds is required for selected audience."
        );
      }

      const tokenDocs = await db
        .collectionGroup("pushTokens")
        .where("enabled", "==", true)
        .get();

      const tokenEntries = tokenDocs.docs
        .map((snap) => {
          const userRef = snap.ref.parent.parent;
          const userId = userRef ? userRef.id : null;
          const token = snap.get("token");

          return {
            userId,
            token: typeof token === "string" ? token : "",
          };
        })
        .filter((entry) => entry.userId && entry.token);

      const filteredTokens =
        audience === "all"
          ? tokenEntries
          : tokenEntries.filter((entry) => selectedUserIds.includes(entry.userId));

      const uniqueTokens = [...new Set(filteredTokens.map((entry) => entry.token))];

      if (uniqueTokens.length === 0) {
        return {
          targetedUsers: audience === "all" ? null : selectedUserIds.length,
          successCount: 0,
          failureCount: 0,
          message: "No eligible push tokens found.",
        };
      }

      const safeUrl = url.startsWith("/") ? url : "/dashboard";

      const response = await getMessaging().sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title,
          body,
        },
        data: {
          url: safeUrl,
        },
        webpush: {
          headers: {
            Urgency: "high",
          },
          notification: {
            title,
            body,
            icon: "/icon.png",
          },
        },
      });

      const invalidTokenErrors = new Set([
        "messaging/invalid-registration-token",
        "messaging/registration-token-not-registered",
      ]);

      const invalidTokens = [];

      response.responses.forEach((result, index) => {
        if (
          !result.success &&
          result.error &&
          invalidTokenErrors.has(result.error.code)
        ) {
          invalidTokens.push(uniqueTokens[index]);
        }
      });

      if (invalidTokens.length > 0) {
        const removals = tokenDocs.docs.filter((snap) =>
          invalidTokens.includes(snap.get("token"))
        );
        await Promise.all(removals.map((snap) => snap.ref.delete()));
      }

      await db.collection("pushLogs").add({
        title,
        body,
        url: safeUrl,
        audience,
        selectedUserIds: audience === "selected" ? selectedUserIds : [],
        targetedTokens: uniqueTokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        targetedUsers: audience === "all" ? null : selectedUserIds.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      console.error("sendPushNotification error:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Push failed."
      );
    }
  }
);