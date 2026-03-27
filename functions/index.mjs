import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";

initializeApp();

const db = getFirestore();

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new HttpsError(
      "failed-precondition",
      "Missing STRIPE_SECRET_KEY in functions environment."
    );
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
  });
}

function getStripeAdminReturnUrl() {
  return (
    process.env.STRIPE_CONNECT_RETURN_URL ||
    "https://app.bootcamp.rivcor.com/admin/payments"
  );
}

function getStripeConnectClientId() {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;

  if (!clientId) {
    throw new HttpsError(
      "failed-precondition",
      "Missing STRIPE_CONNECT_CLIENT_ID in functions environment."
    );
  }

  return clientId;
}

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

function normalizeRecipientValue(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function toMiddayDate(date) {
  return new Date(`${date}T12:00:00`);
}

function addDays(date, days) {
  const parsed = toMiddayDate(date);
  parsed.setDate(parsed.getDate() + days);

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function normalizeBookingDuration(value) {
  const duration = Number(value);
  return duration === 2 || duration === 3 ? duration : 1;
}

function getRemainingSpots(week) {
  return Math.max(0, Number(week?.capacity || 0) - Number(week?.booked || 0));
}

function bookingConsumesCapacity(booking) {
  return Boolean(booking?.consumesCapacity) && booking?.status !== "cancelled";
}

function hydrateWeeksWithBookings(weeks, bookings) {
  return weeks.map((week) => ({
    ...week,
    booked: bookings.filter(
      (booking) =>
        bookingConsumesCapacity(booking) &&
        Array.isArray(booking.weekIds) &&
        booking.weekIds.includes(week.id)
    ).length,
  }));
}

function getConsecutiveBookingWeeks(weeks, startWeekId, duration) {
  const orderedWeeks = [...weeks].sort((a, b) =>
    String(a.startDate || "").localeCompare(String(b.startDate || ""))
  );
  const startIndex = orderedWeeks.findIndex((week) => week.id === startWeekId);

  if (startIndex === -1) {
    return [];
  }

  for (let i = 0; i < duration; i++) {
    const currentWeek = orderedWeeks[startIndex + i];
    const nextExpectedStart =
      i === 0 ? null : addDays(orderedWeeks[startIndex + i - 1].startDate, 7);

    if (!currentWeek) return [];
    if (!currentWeek.active) return [];
    if (getRemainingSpots(currentWeek) <= 0) return [];
    if (nextExpectedStart && currentWeek.startDate !== nextExpectedStart) {
      return [];
    }
  }

  return orderedWeeks.slice(startIndex, startIndex + duration);
}

async function loadBookingContext(excludedBookingId = "") {
  const [weeksSnap, bookingsSnap] = await Promise.all([
    db.collection("bootcampWeeks").orderBy("startDate", "asc").get(),
    db.collection("bookings").get(),
  ]);

  const weeks = weeksSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const bookings = bookingsSnap.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((booking) => booking.id !== excludedBookingId);

  return {
    weeks: hydrateWeeksWithBookings(weeks, bookings),
    bookings,
  };
}

async function resolveBookingUser(userId) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    throw new HttpsError("invalid-argument", "userId is required.");
  }

  const userSnap = await db.collection("users").doc(normalizedUserId).get();

  if (!userSnap.exists) {
    throw new HttpsError("not-found", "Selected user account was not found.");
  }

  const userData = userSnap.data() || {};

  if (userData.role === "admin") {
    throw new HttpsError(
      "invalid-argument",
      "Admin accounts cannot be assigned to bookings."
    );
  }

  const profilesSnap = await db
    .collection("profiles")
    .where("userId", "==", normalizedUserId)
    .limit(1)
    .get();

  const profileDoc = profilesSnap.empty ? null : profilesSnap.docs[0];
  const profileData = profileDoc ? profileDoc.data() || {} : {};

  return {
    userId: normalizedUserId,
    profileId: profileDoc?.id || "",
    customerEmail: String(userData.email || "").trim().toLowerCase(),
    customerName:
      String(
        profileData.fullName ||
          userData.displayName ||
          userData.name ||
          userData.username ||
          userData.email ||
          normalizedUserId
      ).trim(),
  };
}

function buildBookingPayload(data, selectedWeeks, bookingUser) {
  const shortStay = Boolean(data?.shortStay);
  const shortStayNights = Number(data?.shortStayNights || 0);
  const customPrice = Number(data?.customPrice || 0);
  const status = data?.status === "pending" ? "pending" : "confirmed";
  const paymentStatus =
    data?.paymentStatus === "paid" || data?.paymentStatus === "pending"
      ? data.paymentStatus
      : "manual";
  const paymentMethod =
    data?.paymentMethod === "cash" ||
    data?.paymentMethod === "bank_transfer" ||
    data?.paymentMethod === "stripe"
      ? data.paymentMethod
      : "manual";

  return {
    startWeekId: String(data?.startWeekId || ""),
    weekIds: selectedWeeks.map((week) => week.id),
    durationWeeks: normalizeBookingDuration(data?.durationWeeks),
    status,
    source: "admin",
    paymentStatus,
    paymentMethod,
    consumesCapacity: shortStay ? true : Boolean(data?.consumesCapacity),
    customerName: bookingUser.customerName,
    customerEmail: bookingUser.customerEmail,
    userId: bookingUser.userId,
    profileId: bookingUser.profileId || "",
    shortStay,
    shortStayNights: shortStay && shortStayNights > 0 ? shortStayNights : null,
    customPrice: customPrice > 0 ? customPrice : null,
    currency: String(data?.currency || "EUR").trim().toUpperCase() || "EUR",
    notes: String(data?.notes || "").trim(),
  };
}

function validateBookingPayload(payload, selectedWeeks) {
  if (!payload.customerName || !payload.customerEmail || !payload.userId) {
    throw new HttpsError(
      "invalid-argument",
      "A valid platform user is required for manual bookings."
    );
  }

  if (!payload.startWeekId) {
    throw new HttpsError("invalid-argument", "startWeekId is required.");
  }

  if (payload.shortStay && !payload.shortStayNights) {
    throw new HttpsError(
      "invalid-argument",
      "shortStayNights is required for short stays."
    );
  }

  if (selectedWeeks.length !== payload.durationWeeks) {
    throw new HttpsError(
      "failed-precondition",
      "Selected weeks are not available for this duration."
    );
  }
}

function getRecipientAliases(userId, userData) {
  const aliases = [
    userId,
    userData?.email,
    userData?.username,
    userData?.displayName,
    userData?.name,
  ];

  return aliases
    .map((value) => normalizeRecipientValue(value))
    .filter((value) => value.length > 0);
}

async function resolveSelectedUserIds(rawRecipients) {
  const requested = [
    ...new Set(
      rawRecipients
        .map((value) => normalizeRecipientValue(value))
        .filter(Boolean)
    ),
  ];

  if (requested.length === 0) {
    return {
      resolvedUserIds: [],
      unresolvedRecipients: [],
    };
  }

  const usersSnap = await db.collection("users").get();
  const aliasToUserId = new Map();

  usersSnap.docs.forEach((doc) => {
    const userData = doc.data() || {};

    if (userData.role === "admin") {
      return;
    }

    getRecipientAliases(doc.id, userData).forEach((alias) => {
      if (!aliasToUserId.has(alias)) {
        aliasToUserId.set(alias, doc.id);
      }
    });
  });

  const resolvedUserIds = [];
  const unresolvedRecipients = [];

  requested.forEach((recipient) => {
    const resolvedUserId = aliasToUserId.get(recipient);

    if (resolvedUserId) {
      resolvedUserIds.push(resolvedUserId);
    } else {
      unresolvedRecipients.push(recipient);
    }
  });

  return {
    resolvedUserIds: [...new Set(resolvedUserIds)],
    unresolvedRecipients,
  };
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
      let unresolvedRecipients = [];

      if (audience === "selected") {
        const selectedRecipients = await resolveSelectedUserIds(selectedUserIds);
        targetUserIds = selectedRecipients.resolvedUserIds;
        unresolvedRecipients = selectedRecipients.unresolvedRecipients;

        if (targetUserIds.length === 0) {
          throw new HttpsError(
            "invalid-argument",
            "None of the selected recipients could be resolved to user accounts."
          );
        }
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

      const usersWithoutTokens = [];
      tokenGroups.forEach((tokens, index) => {
        if (tokens.length === 0) {
          usersWithoutTokens.push(targetUserIds[index]);
        }
      });

      const uniqueTokens = [...new Set(tokenGroups.flat())];

      if (uniqueTokens.length === 0) {
        return {
          targetedUsers: targetUserIds.length,
          usersWithoutTokens,
          unresolvedRecipients,
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
          fcmOptions: {
            link: safeUrl,
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
        unresolvedRecipients,
        usersWithoutTokens,
        targetedUsers: targetUserIds.length,
        targetedTokens: uniqueTokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        targetedUsers: targetUserIds.length,
        usersWithoutTokens,
        unresolvedRecipients,
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

export const createAdminBooking = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const durationWeeks = normalizeBookingDuration(request.data?.durationWeeks);
      const context = await loadBookingContext();
      const selectedWeeks = getConsecutiveBookingWeeks(
        context.weeks,
        String(request.data?.startWeekId || ""),
        durationWeeks
      );
      const bookingUser = await resolveBookingUser(request.data?.userId);
      const payload = buildBookingPayload(
        { ...request.data, durationWeeks },
        selectedWeeks,
        bookingUser
      );

      validateBookingPayload(payload, selectedWeeks);

      const docRef = await db.collection("bookings").add({
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      });

      return {
        id: docRef.id,
        weekIds: payload.weekIds,
      };
    } catch (error) {
      console.error("createAdminBooking error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Booking creation failed."
      );
    }
  }
);

export const updateAdminBooking = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const bookingId = String(request.data?.bookingId || "").trim();
      if (!bookingId) {
        throw new HttpsError("invalid-argument", "bookingId is required.");
      }

      const durationWeeks = normalizeBookingDuration(request.data?.durationWeeks);
      const context = await loadBookingContext(bookingId);
      const selectedWeeks = getConsecutiveBookingWeeks(
        context.weeks,
        String(request.data?.startWeekId || ""),
        durationWeeks
      );
      const bookingUser = await resolveBookingUser(request.data?.userId);
      const payload = buildBookingPayload(
        { ...request.data, durationWeeks },
        selectedWeeks,
        bookingUser
      );

      validateBookingPayload(payload, selectedWeeks);

      await db.collection("bookings").doc(bookingId).update({
        ...payload,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      });

      return {
        id: bookingId,
        weekIds: payload.weekIds,
      };
    } catch (error) {
      console.error("updateAdminBooking error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Booking update failed."
      );
    }
  }
);

export const cancelAdminBooking = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const bookingId = String(request.data?.bookingId || "").trim();
      if (!bookingId) {
        throw new HttpsError("invalid-argument", "bookingId is required.");
      }

      await db.collection("bookings").doc(bookingId).update({
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      });

      return { id: bookingId };
    } catch (error) {
      console.error("cancelAdminBooking error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Booking cancellation failed."
      );
    }
  }
);

export const deleteAdminBooking = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const bookingId = String(request.data?.bookingId || "").trim();
      if (!bookingId) {
        throw new HttpsError("invalid-argument", "bookingId is required.");
      }

      const bookingRef = db.collection("bookings").doc(bookingId);
      const bookingSnap = await bookingRef.get();

      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const bookingData = bookingSnap.data() || {};

      if (bookingData.status !== "cancelled") {
        throw new HttpsError(
          "failed-precondition",
          "Only cancelled bookings can be permanently deleted."
        );
      }

      await bookingRef.delete();

      return { id: bookingId };
    } catch (error) {
      console.error("deleteAdminBooking error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Booking deletion failed."
      );
    }
  }
);

export const createStripeConnectAuthorizeUrl = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const paymentsRef = db.collection("settings").doc("payments");
      const clientId = getStripeConnectClientId();
      const state = randomUUID();
      const redirectUri = getStripeAdminReturnUrl();

      await paymentsRef.set(
        {
          provider: "stripe_connect",
          accountType: "standard",
          connectionMode: "oauth",
          pendingOauthState: state,
          pendingOauthUserId: request.auth.uid,
          oauthRedirectUri: redirectUri,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        url:
          "https://connect.stripe.com/oauth/authorize" +
          `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
          `&scope=read_write&state=${encodeURIComponent(state)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}`,
      };
    } catch (error) {
      console.error("createStripeConnectAuthorizeUrl error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Stripe authorization link failed."
      );
    }
  }
);

export const completeStripeConnectStandard = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const code = String(request.data?.code || "").trim();
      const state = String(request.data?.state || "").trim();

      if (!code || !state) {
        throw new HttpsError(
          "invalid-argument",
          "Both code and state are required."
        );
      }

      const stripe = getStripeClient();
      const paymentsRef = db.collection("settings").doc("payments");
      const paymentsSnap = await paymentsRef.get();

      if (!paymentsSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Payments settings were not initialized."
        );
      }

      const paymentsData = paymentsSnap.data() || {};

      if (
        state !== String(paymentsData.pendingOauthState || "") ||
        request.auth.uid !== String(paymentsData.pendingOauthUserId || "")
      ) {
        throw new HttpsError(
          "permission-denied",
          "Stripe connection session is not valid anymore."
        );
      }

      const tokenResponse = await stripe.oauth.token({
        grant_type: "authorization_code",
        code,
      });

      await paymentsRef.set(
        {
          provider: "stripe_connect",
          accountType: "standard",
          connectionMode: "oauth",
          stripeAccountId: tokenResponse.stripe_user_id,
          scope: tokenResponse.scope || "read_write",
          livemode: Boolean(tokenResponse.livemode),
          onboardingComplete: true,
          pendingOauthState: FieldValue.delete(),
          pendingOauthUserId: FieldValue.delete(),
          oauthRedirectUri: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          connectedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        stripeAccountId: tokenResponse.stripe_user_id,
        livemode: Boolean(tokenResponse.livemode),
        scope: tokenResponse.scope || "read_write",
      };
    } catch (error) {
      console.error("completeStripeConnectStandard error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Stripe connection failed."
      );
    }
  }
);

export const refreshStripeConnectStatus = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const stripe = getStripeClient();
      const paymentsRef = db.collection("settings").doc("payments");
      const paymentsSnap = await paymentsRef.get();

      if (!paymentsSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Payments settings not initialized."
        );
      }

      const paymentsData = paymentsSnap.data() || {};
      const stripeAccountId = String(paymentsData.stripeAccountId || "").trim();

      if (!stripeAccountId) {
        throw new HttpsError(
          "failed-precondition",
          "Stripe account is not connected yet."
        );
      }

      const account = await stripe.accounts.retrieve(stripeAccountId);

      await paymentsRef.set(
        {
          provider: "stripe_connect",
          stripeAccountId: account.id,
          accountEmail: account.email || paymentsData.accountEmail || "",
          country: account.country || "",
          currency: account.default_currency || "",
          chargesEnabled: Boolean(account.charges_enabled),
          payoutsEnabled: Boolean(account.payouts_enabled),
          detailsSubmitted: Boolean(account.details_submitted),
          onboardingComplete: Boolean(
            account.details_submitted &&
              account.charges_enabled
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        stripeAccountId: account.id,
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        detailsSubmitted: Boolean(account.details_submitted),
      };
    } catch (error) {
      console.error("refreshStripeConnectStatus error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Stripe status refresh failed."
      );
    }
  }
);
