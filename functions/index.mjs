import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();

const db = getFirestore();

async function assertAdmin(auth) {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const snap = await db.collection("users").doc(auth.uid).get();
  const role = snap.exists ? snap.data()?.role : null;

  if (role !== "admin") {
    throw new HttpsError("permission-denied", "Admin role required.");
  }
}

async function getUserPushTokens(userId) {
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .where("enabled", "==", true)
    .get();

  return snap.docs
    .map((doc) => doc.get("token"))
    .filter((token) => typeof token === "string" && token.length > 0);
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

      let targetUserIds = [];

      if (audience === "selected") {
        targetUserIds = selectedUserIds;
      } else {
        const usersSnap = await db.collection("users").get();
        targetUserIds = usersSnap.docs
          .map((doc) => ({
            id: doc.id,
            role: doc.data()?.role || null,
          }))
          .filter((user) => user.role !== "admin")
          .map((user) => user.id);
      }

      const tokenGroups = await Promise.all(
        targetUserIds.map((userId) => getUserPushTokens(userId))
      );

      const uniqueTokens = [...new Set(tokenGroups.flat())];

      if (uniqueTokens.length === 0) {
        return {
          targetedUsers: audience === "all" ? targetUserIds.length : selectedUserIds.length,
          successCount: 0,
          failureCount: 0,
          message: "No eligible push tokens found.",
        };
      }

      const safeUrl = url.startsWith("/") ? url : "/dashboard";

      const response = await getMessaging().sendEachForMulticast({
        tokens: uniqueTokens,
        data: {
          title,
          body,
          url: safeUrl,
        },
        webpush: {
          headers: {
            Urgency: "high",
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
        await Promise.all(
          targetUserIds.map(async (userId) => {
            const snap = await db
              .collection("users")
              .doc(userId)
              .collection("pushTokens")
              .get();

            const removals = snap.docs.filter((doc) =>
              invalidTokens.includes(doc.get("token"))
            );

            await Promise.all(removals.map((doc) => doc.ref.delete()));
          })
        );
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
        targetedUsers: audience === "all" ? targetUserIds.length : selectedUserIds.length,
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