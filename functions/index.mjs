import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
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

function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    "https://app.bootcamp.rivcor.com"
  );
}

function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new HttpsError(
      "failed-precondition",
      "Missing STRIPE_WEBHOOK_SECRET in functions environment."
    );
  }

  return webhookSecret;
}

function getStripeConnectWebhookSecret() {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new HttpsError(
      "failed-precondition",
      "Missing STRIPE_CONNECT_WEBHOOK_SECRET in functions environment."
    );
  }

  return webhookSecret;
}

function getResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Missing RESEND_API_KEY in functions environment."
    );
  }

  return apiKey;
}

function getResendFromEmail() {
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!fromEmail) {
    throw new HttpsError(
      "failed-precondition",
      "Missing RESEND_FROM_EMAIL in functions environment."
    );
  }

  return fromEmail;
}

function resolveCheckoutReturnUrl(path, fallbackPath) {
  const appBaseUrl = getAppBaseUrl();
  const safePath =
    typeof path === "string" && path.trim().startsWith("/")
      ? path.trim()
      : fallbackPath;

  return `${appBaseUrl}${safePath}`;
}

function getFunctionsBaseUrl() {
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    "bootcamp-platform-27d16";

  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

function getWebsitePricingRevalidateUrl() {
  return (
    process.env.WEBSITE_PRICING_REVALIDATE_URL?.replace(/\/$/, "") ||
    "https://www.bootcamp.rivcor.com/api/revalidate-pricing"
  );
}

function getWebsitePricingRevalidateSecret() {
  const secret = process.env.WEBSITE_PRICING_REVALIDATE_SECRET;

  if (!secret) {
    throw new HttpsError(
      "failed-precondition",
      "Missing WEBSITE_PRICING_REVALIDATE_SECRET in functions environment."
    );
  }

  return secret;
}

async function triggerWebsitePricingRevalidation() {
  const response = await fetch(getWebsitePricingRevalidateUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-revalidate-secret": getWebsitePricingRevalidateSecret(),
    },
    body: JSON.stringify({
      source: "bootcamp-platform",
      target: "booking-pricing",
    }),
  });

  const payload = await response
    .json()
    .catch(() => ({ error: "Invalid response from website revalidation endpoint." }));

  if (!response.ok) {
    throw new HttpsError(
      "internal",
      typeof payload?.error === "string"
        ? payload.error
        : "Website pricing revalidation failed."
    );
  }

  return payload;
}

function getStripeAdminPaymentsUrl(params = {}) {
  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
  const fallbackUrl =
    process.env.STRIPE_CONNECT_RETURN_URL ||
    (appBaseUrl ? `${appBaseUrl}/admin/payments` : "") ||
    "https://app.bootcamp.rivcor.com/admin/payments";

  const url = new URL(fallbackUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function getStripeAdminReturnUrl() {
  return getStripeAdminPaymentsUrl({ stripe: "return" });
}

function getStripeAdminRefreshUrl() {
  return getStripeAdminPaymentsUrl({ stripe: "refresh" });
}

function formatStripeRequirementErrors(errors) {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors
    .map((item) => ({
      code: typeof item?.code === "string" ? item.code : "",
      reason: typeof item?.reason === "string" ? item.reason : "",
      requirement:
        typeof item?.requirement === "string" ? item.requirement : "",
    }))
    .filter(
      (item) => item.code || item.reason || item.requirement
    );
}

function buildStripeAccountSnapshot(account, paymentsData = {}, extra = {}) {
  const requirements = account.requirements || {};
  const businessProfile = account.business_profile || {};
  const dashboardSettings = account.settings?.dashboard || {};

  const snapshot = {
    provider: "stripe_connect",
    accountType: "standard",
    connectionMode: extra.connectionMode || "hosted_onboarding",
    stripeAccountId: account.id,
    accountEmail: account.email || paymentsData.accountEmail || "",
    businessName:
      businessProfile.name ||
      dashboardSettings.display_name ||
      paymentsData.businessName ||
      "",
    country: account.country || paymentsData.country || "",
    currency: account.default_currency || paymentsData.currency || "",
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    onboardingComplete: Boolean(
      account.details_submitted &&
        account.charges_enabled &&
        account.payouts_enabled
    ),
    requirementsCurrentlyDue: Array.isArray(requirements.currently_due)
      ? requirements.currently_due
      : [],
    requirementsEventuallyDue: Array.isArray(requirements.eventually_due)
      ? requirements.eventually_due
      : [],
    requirementsPastDue: Array.isArray(requirements.past_due)
      ? requirements.past_due
      : [],
    requirementsPendingVerification: Array.isArray(
      requirements.pending_verification
    )
      ? requirements.pending_verification
      : [],
    requirementsDisabledReason:
      typeof requirements.disabled_reason === "string"
        ? requirements.disabled_reason
        : "",
    requirementsErrors: formatStripeRequirementErrors(requirements.errors),
    updatedAt: FieldValue.serverTimestamp(),
    pendingOauthState: FieldValue.delete(),
    pendingOauthUserId: FieldValue.delete(),
    oauthRedirectUri: FieldValue.delete(),
  };

  snapshot.requirementsCurrentDeadline =
    typeof requirements.current_deadline === "number"
      ? new Date(requirements.current_deadline * 1000)
      : FieldValue.delete();

  if (
    typeof extra.livemode === "boolean" ||
    typeof paymentsData.livemode === "boolean"
  ) {
    snapshot.livemode =
      typeof extra.livemode === "boolean"
        ? extra.livemode
        : Boolean(paymentsData.livemode);
  }

  if (extra.scope) {
    snapshot.scope = extra.scope;
  }

  if (paymentsData.connectedAt) {
    snapshot.connectedAt = paymentsData.connectedAt;
  } else if (account.details_submitted) {
    snapshot.connectedAt = FieldValue.serverTimestamp();
  }

  return snapshot;
}

async function syncStripeAccountSettings({
  stripe,
  paymentsRef,
  paymentsData = {},
  stripeAccountId,
  extra = {},
}) {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const snapshot = buildStripeAccountSnapshot(account, paymentsData, extra);

  await paymentsRef.set(snapshot, { merge: true });

  return { account, snapshot };
}

async function loadStripePaymentsSettings() {
  const paymentsRef = db.collection("settings").doc("payments");
  const paymentsSnap = await paymentsRef.get();
  const paymentsData = paymentsSnap.exists ? paymentsSnap.data() || {} : {};

  return { paymentsRef, paymentsData };
}

async function getReadyStripeConnectedAccount() {
  const { paymentsData } = await loadStripePaymentsSettings();
  const stripeAccountId = String(paymentsData.stripeAccountId || "").trim();

  if (!stripeAccountId) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe payments are not connected yet."
    );
  }

  if (!paymentsData.chargesEnabled || !paymentsData.payoutsEnabled) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe onboarding is not complete yet."
    );
  }

  return {
    stripeAccountId,
    paymentsData,
  };
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

async function assertClientUser(auth) {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const snap = await db.collection("users").doc(auth.uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  const role = String(data.role || "user").trim();

  if (data.status === "inactive") {
    throw new HttpsError("permission-denied", "Inactive users cannot book.");
  }

  if (role && role !== "user") {
    throw new HttpsError("permission-denied", "Client user role required.");
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

async function getActiveUserIdsByRoles(roles) {
  const uniqueRoles = [...new Set(roles.filter((role) => typeof role === "string" && role))];

  if (uniqueRoles.length === 0) {
    return [];
  }

  const snapshots = await Promise.all(
    uniqueRoles.map((role) =>
      db
        .collection("users")
        .where("role", "==", role)
        .get()
    )
  );

  const userIds = [];

  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (data.status !== "inactive") {
        userIds.push(doc.id);
      }
    });
  });

  return [...new Set(userIds)];
}

async function sendPushToUserIds({
  userIds,
  title,
  body,
  url = "/",
  createdBy = "",
  metadata = {},
}) {
  const targetUserIds = [...new Set(userIds.filter((value) => typeof value === "string" && value.trim()))];

  if (targetUserIds.length === 0) {
    return {
      targetedUsers: 0,
      usersWithoutTokens: [],
      successCount: 0,
      failureCount: 0,
    };
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
      successCount: 0,
      failureCount: 0,
    };
  }

  const safeUrl = String(url || "/").startsWith("/") ? String(url || "/") : "/";

  const response = await getMessaging().sendEachForMulticast({
    tokens: uniqueTokens,
    data: {
      title: String(title || "").trim(),
      body: String(body || "").trim(),
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
    audience: "selected",
    selectedUserIds: targetUserIds,
    usersWithoutTokens,
    targetedUsers: targetUserIds.length,
    targetedTokens: uniqueTokens.length,
    successCount: response.successCount,
    failureCount: response.failureCount,
    createdBy,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    targetedUsers: targetUserIds.length,
    usersWithoutTokens,
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}

function getThreadRecipientRoles(threadCategory) {
  if (threadCategory === "coach") return ["coach", "admin"];
  if (threadCategory === "nutrition") return ["nutritionist", "admin"];
  if (threadCategory === "sessions") return ["coach", "nutritionist", "admin"];
  return ["admin"];
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

function getTodayDateString() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPublicDateLabel(date) {
  if (!date) return "";

  return toMiddayDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatPublicWeekLabel(startDate, endDate) {
  const startLabel = formatPublicDateLabel(startDate);
  const endLabel = formatPublicDateLabel(endDate);

  if (!startLabel || !endLabel) {
    return "";
  }

  return `${startLabel} - ${endLabel}`;
}

function normalizeBookingDuration(value) {
  const duration = Number(value);
  return duration === 2 || duration === 3 ? duration : 1;
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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

async function loadBookingPricing() {
  const pricingSnap = await db.collection("settings").doc("bookingPricing").get();
  const pricingData = pricingSnap.exists ? pricingSnap.data() || {} : {};
  const currency =
    String(pricingData.currency || "EUR").trim().toUpperCase() || "EUR";

  return {
    oneWeekPrice:
      typeof pricingData.oneWeekPrice === "number" && pricingData.oneWeekPrice > 0
        ? pricingData.oneWeekPrice
        : null,
    twoWeekPrice:
      typeof pricingData.twoWeekPrice === "number" && pricingData.twoWeekPrice > 0
        ? pricingData.twoWeekPrice
        : null,
    threeWeekPrice:
      typeof pricingData.threeWeekPrice === "number" && pricingData.threeWeekPrice > 0
        ? pricingData.threeWeekPrice
        : null,
    currency,
  };
}

function getBookingPriceForDuration(pricing, durationWeeks) {
  const amount =
    durationWeeks === 3
      ? pricing.threeWeekPrice
      : durationWeeks === 2
      ? pricing.twoWeekPrice
      : pricing.oneWeekPrice;

  if (typeof amount !== "number" || amount <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Booking pricing is not configured for this duration yet."
    );
  }

  return {
    amount,
    currency: pricing.currency || "EUR",
  };
}

function toStripeUnitAmount(amount) {
  const numericAmount = Number(amount || 0);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "A valid positive amount is required for checkout."
    );
  }

  return Math.round(numericAmount * 100);
}

function getBookingProductName(durationWeeks) {
  return `Wild Atlantic Bootcamp · ${durationWeeks} week${
    durationWeeks === 1 ? "" : "s"
  }`;
}

async function createExternalCheckoutSession({
  customerEmail,
  customerName = "",
  durationWeeks,
}) {
  if (!isValidEmailAddress(customerEmail)) {
    throw new HttpsError(
      "invalid-argument",
      "A valid customerEmail is required."
    );
  }

  const pricing = await loadBookingPricing();
  const price = getBookingPriceForDuration(pricing, durationWeeks);
  const { stripeAccountId } = await getReadyStripeConnectedAccount();
  const stripe = getStripeClient();
  const finalizeUrl = new URL(
    `${getFunctionsBaseUrl()}/finalizeExternalBookingCheckout`
  );
  finalizeUrl.searchParams.set("account_id", stripeAccountId);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: customerEmail,
      metadata: {
        flow: "external_entitlement",
        customerEmail,
        customerName,
        durationWeeks: String(durationWeeks),
        connectedAccountId: stripeAccountId,
      },
      success_url: `${finalizeUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: resolveCheckoutReturnUrl(
        "/book?checkout=external-cancel",
        "/book?checkout=external-cancel"
      ),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: price.currency.toLowerCase(),
            unit_amount: toStripeUnitAmount(price.amount),
            product_data: {
              name: `${getBookingProductName(durationWeeks)} credit`,
              description:
                "Redeemable stay credit for a later week selection inside the client portal.",
            },
          },
        },
      ],
    },
    {
      stripeAccount: stripeAccountId,
    }
  );

  return {
    url: session.url || "",
    sessionId: session.id,
    stripeAccountId,
  };
}

async function sendBookingEntitlementEmail({
  code,
  customerEmail,
  customerName = "",
  durationWeeks,
  amount,
  currency = "EUR",
}) {
  const apiKey = getResendApiKey();
  const fromEmail = getResendFromEmail();
  const redeemUrl = `${getAppBaseUrl()}/login?next=${encodeURIComponent(
    `/dashboard/book?code=${code}`
  )}`;
  const safeName = String(customerName || "").trim() || "there";
  const formattedAmount = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
  const plural = durationWeeks === 1 ? "" : "s";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [customerEmail],
      subject: `Your ${durationWeeks}-week booking code`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <p>Hi ${safeName},</p>
          <p>Thanks for your purchase. Your ${durationWeeks}-week bootcamp credit is ready.</p>
          <p><strong>Code:</strong> ${code}<br /><strong>Value:</strong> ${formattedAmount}</p>
          <p>Create your account with this email or open the link below to redeem your stay.</p>
          <p><a href="${redeemUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 18px;border-radius:10px;text-decoration:none;">Redeem ${durationWeeks} week${plural}</a></p>
          <p>If you already have an account with this same email, the credit can appear automatically in your Book section.</p>
        </div>
      `,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof payload?.message === "string"
        ? payload.message
        : "Resend email request failed."
    );
  }

  return payload;
}

function normalizeBookingEntitlementCode(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = raw.startsWith("WAB") ? raw.slice(3) : raw;
  const core = withoutPrefix.slice(0, 12);

  if (core.length !== 12) {
    return "";
  }

  return `WAB-${core.slice(0, 4)}-${core.slice(4, 8)}-${core.slice(8, 12)}`;
}

function createBookingEntitlementCode() {
  return normalizeBookingEntitlementCode(randomUUID());
}

async function generateUniqueBookingEntitlementCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createBookingEntitlementCode();
    const snap = await db.collection("bookingEntitlements").doc(code).get();

    if (!snap.exists) {
      return code;
    }
  }

  throw new HttpsError(
    "internal",
    "Could not generate a unique redemption code."
  );
}

function isActiveBookingEntitlementStatus(status) {
  return status === "issued" || status === "claimed";
}

function sanitizeBookingEntitlement(data = {}, docId = "") {
  return {
    id: docId,
    code: String(data.code || docId || ""),
    customerEmail: String(data.customerEmail || "").trim().toLowerCase(),
    customerName: String(data.customerName || "").trim(),
    durationWeeks: normalizeBookingDuration(data.durationWeeks),
    amount: typeof data.amount === "number" ? data.amount : null,
    currency: String(data.currency || "EUR").trim().toUpperCase() || "EUR",
    status: String(data.status || "issued"),
    notes: String(data.notes || "").trim(),
    claimedByUid: String(data.claimedByUid || "").trim(),
    claimedByEmail: String(data.claimedByEmail || "").trim().toLowerCase(),
    bookingId: String(data.bookingId || "").trim(),
    createdAt: data.createdAt || null,
    redeemedAt: data.redeemedAt || null,
  };
}

async function loadUserBookingEntitlements({ userId, email }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const [claimedSnap, emailSnap] = await Promise.all([
    db.collection("bookingEntitlements").where("claimedByUid", "==", userId).get(),
    normalizedEmail
      ? db
          .collection("bookingEntitlements")
          .where("customerEmail", "==", normalizedEmail)
          .get()
      : Promise.resolve(null),
  ]);

  const merged = new Map();

  [claimedSnap, emailSnap]
    .filter(Boolean)
    .forEach((snap) => {
      snap.docs.forEach((doc) => {
        merged.set(doc.id, sanitizeBookingEntitlement(doc.data() || {}, doc.id));
      });
    });

  return [...merged.values()]
    .filter((item) => isActiveBookingEntitlementStatus(item.status))
    .filter(
      (item) => !item.claimedByUid || item.claimedByUid === String(userId || "")
    )
    .sort(
      (a, b) =>
        Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0)
    );
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

export const getUserBookingCatalog = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertClientUser(request.auth);

      const [context, pricing, bookingUser, userBookingsSnap] = await Promise.all([
        loadBookingContext(),
        loadBookingPricing(),
        resolveBookingUser(request.auth.uid),
        db.collection("bookings").where("userId", "==", request.auth.uid).get(),
      ]);
      const entitlements = await loadUserBookingEntitlements({
        userId: request.auth.uid,
        email: bookingUser.customerEmail,
      });

      const userBookings = userBookingsSnap.docs
        .map((doc) => {
          const data = doc.data() || {};

          return {
            id: doc.id,
            startWeekId: String(data.startWeekId || ""),
            weekIds: Array.isArray(data.weekIds)
              ? data.weekIds.map((value) => String(value || "")).filter(Boolean)
              : [],
            durationWeeks: normalizeBookingDuration(data.durationWeeks),
            status: String(data.status || "pending"),
            paymentStatus: String(data.paymentStatus || "pending"),
            paymentMethod: String(data.paymentMethod || "stripe"),
            customPrice:
              typeof data.customPrice === "number" ? data.customPrice : null,
            currency: String(data.currency || pricing.currency || "EUR"),
            createdAt: data.createdAt || null,
          };
        })
        .sort(
          (a, b) =>
            Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0)
        );

      return {
        weeks: context.weeks.map((week) => ({
          id: week.id,
          startDate: String(week.startDate || ""),
          endDate: String(week.endDate || ""),
          active: Boolean(week.active),
          capacity: Number(week.capacity || 0),
          booked: Number(week.booked || 0),
          label: String(week.label || ""),
          notes: String(week.notes || ""),
        })),
        pricing,
        bookings: userBookings,
        entitlements,
      };
    } catch (error) {
      console.error("getUserBookingCatalog error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Could not load booking catalog."
      );
    }
  }
);

export const getPublicBookingAvailability = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const today = getTodayDateString();
      const { weeks } = await loadBookingContext();
      const availableWeeks = weeks
        .filter((week) => {
          if (!week.active) return false;
          if (getRemainingSpots(week) <= 0) return false;
          if (String(week.startDate || "") < today) return false;
          return true;
        })
        .map((week) => ({
          id: week.id,
          startDate: String(week.startDate || ""),
          endDate: String(week.endDate || ""),
          label:
            String(week.label || "").trim() ||
            formatPublicWeekLabel(
              String(week.startDate || ""),
              String(week.endDate || "")
            ),
          remainingSpots: getRemainingSpots(week),
        }));

      res.set("Cache-Control", "public, max-age=300, s-maxage=300");
      res.status(200).json({
        weeks: availableWeeks,
      });
    } catch (error) {
      console.error("getPublicBookingAvailability error:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not load public booking availability.",
      });
    }
  }
);

export const createBookingEntitlement = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const customerEmail = String(request.data?.customerEmail || "")
        .trim()
        .toLowerCase();
      const customerName = String(request.data?.customerName || "").trim();
      const durationWeeks = normalizeBookingDuration(request.data?.durationWeeks);
      const requestedAmount = Number(request.data?.amount || 0);
      const requestedCurrency = String(request.data?.currency || "")
        .trim()
        .toUpperCase();
      const notes = String(request.data?.notes || "").trim();

      if (!isValidEmailAddress(customerEmail)) {
        throw new HttpsError(
          "invalid-argument",
          "A valid customerEmail is required."
        );
      }

      const pricing = await loadBookingPricing();
      const fallbackPrice = getBookingPriceForDuration(pricing, durationWeeks);
      const amount = requestedAmount > 0 ? requestedAmount : fallbackPrice.amount;
      const currency = requestedCurrency || fallbackPrice.currency;
      const code = await generateUniqueBookingEntitlementCode();

      await db.collection("bookingEntitlements").doc(code).set({
        code,
        customerEmail,
        customerName,
        durationWeeks,
        amount,
        currency,
        status: "issued",
        source: "external",
        notes,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        id: code,
        code,
        customerEmail,
        durationWeeks,
        amount,
        currency,
      };
    } catch (error) {
      console.error("createBookingEntitlement error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error
          ? error.message
          : "Could not create booking entitlement."
      );
    }
  }
);

export const getPublicBookingPricing = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const pricing = await loadBookingPricing();

      res.set("Cache-Control", "public, max-age=300, s-maxage=300");
      res.status(200).json({
        pricing: {
          oneWeekPrice: pricing.oneWeekPrice,
          twoWeekPrice: pricing.twoWeekPrice,
          threeWeekPrice: pricing.threeWeekPrice,
          currency: pricing.currency || "EUR",
        },
      });
    } catch (error) {
      console.error("getPublicBookingPricing error:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not load public booking pricing.",
      });
    }
  }
);

export const notifyWebsitePricingUpdated = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);
      const payload = await triggerWebsitePricingRevalidation();

      return {
        ok: true,
        ...payload,
      };
    } catch (error) {
      console.error("notifyWebsitePricingUpdated error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error
          ? error.message
          : "Could not notify website pricing update."
      );
    }
  }
);

export const claimBookingEntitlementCode = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertClientUser(request.auth);

      const bookingUser = await resolveBookingUser(request.auth.uid);
      const code = normalizeBookingEntitlementCode(request.data?.code);

      if (!code) {
        throw new HttpsError("invalid-argument", "A valid redemption code is required.");
      }

      const entitlementRef = db.collection("bookingEntitlements").doc(code);
      const entitlementSnap = await entitlementRef.get();

      if (!entitlementSnap.exists) {
        throw new HttpsError("not-found", "Redemption code not found.");
      }

      const entitlementData = entitlementSnap.data() || {};
      const status = String(entitlementData.status || "issued");
      const claimedByUid = String(entitlementData.claimedByUid || "").trim();

      if (status === "redeemed") {
        throw new HttpsError(
          "failed-precondition",
          "This code has already been redeemed."
        );
      }

      if (status === "cancelled" || status === "expired") {
        throw new HttpsError(
          "failed-precondition",
          "This code is no longer active."
        );
      }

      if (claimedByUid && claimedByUid !== request.auth.uid) {
        throw new HttpsError(
          "permission-denied",
          "This code is already linked to another account."
        );
      }

      const updates = {
        claimedByUid: request.auth.uid,
        claimedByEmail: bookingUser.customerEmail,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!claimedByUid) {
        updates.claimedAt = FieldValue.serverTimestamp();
        updates.status = status === "issued" ? "claimed" : status;
      }

      await entitlementRef.set(updates, { merge: true });

      const latestSnap = await entitlementRef.get();

      return {
        entitlement: sanitizeBookingEntitlement(latestSnap.data() || {}, latestSnap.id),
      };
    } catch (error) {
      console.error("claimBookingEntitlementCode error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Could not claim redemption code."
      );
    }
  }
);

export const redeemBookingEntitlement = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertClientUser(request.auth);

      const entitlementId = normalizeBookingEntitlementCode(
        request.data?.entitlementId || request.data?.code
      );
      const startWeekId = String(request.data?.startWeekId || "").trim();

      if (!entitlementId) {
        throw new HttpsError(
          "invalid-argument",
          "A valid entitlementId is required."
        );
      }

      if (!startWeekId) {
        throw new HttpsError("invalid-argument", "startWeekId is required.");
      }

      const [context, bookingUser, pricing] = await Promise.all([
        loadBookingContext(),
        resolveBookingUser(request.auth.uid),
        loadBookingPricing(),
      ]);

      const entitlementRef = db.collection("bookingEntitlements").doc(entitlementId);
      const entitlementSnap = await entitlementRef.get();

      if (!entitlementSnap.exists) {
        throw new HttpsError("not-found", "Redemption code not found.");
      }

      const entitlementData = entitlementSnap.data() || {};
      const entitlement = sanitizeBookingEntitlement(entitlementData, entitlementSnap.id);

      if (entitlement.status === "redeemed") {
        throw new HttpsError(
          "failed-precondition",
          "This code has already been redeemed."
        );
      }

      if (entitlement.status === "cancelled" || entitlement.status === "expired") {
        throw new HttpsError(
          "failed-precondition",
          "This code is no longer active."
        );
      }

      if (entitlement.claimedByUid && entitlement.claimedByUid !== request.auth.uid) {
        throw new HttpsError(
          "permission-denied",
          "This code is linked to another account."
        );
      }

      const canUseByEmail =
        entitlement.customerEmail &&
        entitlement.customerEmail === bookingUser.customerEmail;

      if (!entitlement.claimedByUid && !canUseByEmail) {
        throw new HttpsError(
          "permission-denied",
          "Claim this code first from the account that will redeem it."
        );
      }

      const durationWeeks = normalizeBookingDuration(entitlement.durationWeeks);
      const selectedWeeks = getConsecutiveBookingWeeks(
        context.weeks,
        startWeekId,
        durationWeeks
      );

      const hasOverlappingBooking = context.bookings.some((booking) => {
        if (String(booking.userId || "") !== request.auth.uid) {
          return false;
        }

        if (booking.status === "cancelled" || !Array.isArray(booking.weekIds)) {
          return false;
        }

        return selectedWeeks.some((week) => booking.weekIds.includes(week.id));
      });

      if (hasOverlappingBooking) {
        throw new HttpsError(
          "failed-precondition",
          "You already have a booking covering one or more of these weeks."
        );
      }

      const fallbackPrice = getBookingPriceForDuration(pricing, durationWeeks);
      const amount =
        typeof entitlement.amount === "number" && entitlement.amount > 0
          ? entitlement.amount
          : fallbackPrice.amount;
      const currency = entitlement.currency || fallbackPrice.currency;

      const payload = {
        startWeekId,
        weekIds: selectedWeeks.map((week) => week.id),
        durationWeeks,
        status: "confirmed",
        source: "public",
        paymentStatus: "paid",
        paymentMethod: "manual",
        consumesCapacity: true,
        customerName: bookingUser.customerName,
        customerEmail: bookingUser.customerEmail,
        userId: bookingUser.userId,
        profileId: bookingUser.profileId || "",
        shortStay: false,
        shortStayNights: null,
        customPrice: amount,
        currency,
        notes: [String(entitlement.notes || "").trim(), `Redeemed code ${entitlementId}`]
          .filter(Boolean)
          .join(" · "),
      };

      validateBookingPayload(payload, selectedWeeks);

      const bookingRef = db.collection("bookings").doc();

      await db.runTransaction(async (transaction) => {
        const latestEntitlementSnap = await transaction.get(entitlementRef);

        if (!latestEntitlementSnap.exists) {
          throw new HttpsError("not-found", "Redemption code not found.");
        }

        const latestEntitlement = sanitizeBookingEntitlement(
          latestEntitlementSnap.data() || {},
          latestEntitlementSnap.id
        );

        if (latestEntitlement.status === "redeemed") {
          throw new HttpsError(
            "failed-precondition",
            "This code has already been redeemed."
          );
        }

        if (
          latestEntitlement.claimedByUid &&
          latestEntitlement.claimedByUid !== request.auth.uid
        ) {
          throw new HttpsError(
            "permission-denied",
            "This code is linked to another account."
          );
        }

        transaction.set(bookingRef, {
          ...payload,
          entitlementId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: request.auth.uid,
        });

        transaction.set(
          entitlementRef,
          {
            claimedByUid: request.auth.uid,
            claimedByEmail: bookingUser.customerEmail,
            claimedAt: latestEntitlement.claimedByUid
              ? latestEntitlementSnap.get("claimedAt") || FieldValue.serverTimestamp()
              : FieldValue.serverTimestamp(),
            status: "redeemed",
            bookingId: bookingRef.id,
            redeemedByUid: request.auth.uid,
            redeemedStartWeekId: startWeekId,
            redeemedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      return {
        id: bookingRef.id,
        entitlementId,
        weekIds: payload.weekIds,
        amount: payload.customPrice,
        currency: payload.currency,
        durationWeeks: payload.durationWeeks,
      };
    } catch (error) {
      console.error("redeemBookingEntitlement error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error
          ? error.message
          : "Could not redeem booking entitlement."
      );
    }
  }
);

export const createUserBookingCheckoutSession = onCall(
  { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => {
    try {
      await assertClientUser(request.auth);

      const durationWeeks = normalizeBookingDuration(request.data?.durationWeeks);
      const startWeekId = String(request.data?.startWeekId || "").trim();
      const notes = String(request.data?.notes || "").trim();

      if (!startWeekId) {
        throw new HttpsError("invalid-argument", "startWeekId is required.");
      }

      const [context, bookingUser, pricing] = await Promise.all([
        loadBookingContext(),
        resolveBookingUser(request.auth.uid),
        loadBookingPricing(),
      ]);

      const selectedWeeks = getConsecutiveBookingWeeks(
        context.weeks,
        startWeekId,
        durationWeeks
      );
      const price = getBookingPriceForDuration(pricing, durationWeeks);

      const hasOverlappingBooking = context.bookings.some((booking) => {
        if (String(booking.userId || "") !== request.auth.uid) {
          return false;
        }

        if (booking.status === "cancelled" || !Array.isArray(booking.weekIds)) {
          return false;
        }

        return selectedWeeks.some((week) => booking.weekIds.includes(week.id));
      });

      if (hasOverlappingBooking) {
        throw new HttpsError(
          "failed-precondition",
          "You already have a booking covering one or more of these weeks."
        );
      }

      const payload = {
        startWeekId,
        weekIds: selectedWeeks.map((week) => week.id),
        durationWeeks,
        status: "pending",
        source: "public",
        paymentStatus: "pending",
        paymentMethod: "stripe",
        consumesCapacity: true,
        customerName: bookingUser.customerName,
        customerEmail: bookingUser.customerEmail,
        userId: bookingUser.userId,
        profileId: bookingUser.profileId || "",
        shortStay: false,
        shortStayNights: null,
        customPrice: price.amount,
        currency: price.currency,
        notes,
      };

      validateBookingPayload(payload, selectedWeeks);

      const bookingRef = await db.collection("bookings").add({
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        checkoutStatus: "open",
      });

      const { stripeAccountId } = await getReadyStripeConnectedAccount();
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: bookingUser.customerEmail,
        client_reference_id: bookingRef.id,
        metadata: {
          flow: "internal_booking",
          bookingId: bookingRef.id,
          userId: request.auth.uid,
          startWeekId,
          durationWeeks: String(durationWeeks),
          connectedAccountId: stripeAccountId,
        },
        success_url: resolveCheckoutReturnUrl(
          "/dashboard/book?checkout=success",
          "/dashboard/book?checkout=success"
        ),
        cancel_url: resolveCheckoutReturnUrl(
          `/dashboard/book?checkout=cancel&bookingId=${encodeURIComponent(
            bookingRef.id
          )}`,
          "/dashboard/book?checkout=cancel"
        ),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: price.currency.toLowerCase(),
              unit_amount: toStripeUnitAmount(price.amount),
              product_data: {
                name: getBookingProductName(durationWeeks),
                description: `${selectedWeeks.length} consecutive bootcamp week${
                  selectedWeeks.length === 1 ? "" : "s"
                }`,
              },
            },
          },
        ],
      }, {
        stripeAccount: stripeAccountId,
      });

      await bookingRef.set(
        {
          stripeAccountId,
          stripeCheckoutSessionId: session.id,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        bookingId: bookingRef.id,
        url: session.url || "",
        sessionId: session.id,
      };
    } catch (error) {
      console.error("createUserBookingCheckoutSession error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error
          ? error.message
          : "Could not create booking checkout session."
      );
    }
  }
);

export const createExternalBookingCheckoutSession = onCall(
  { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => {
    try {
      const customerEmail = String(request.data?.customerEmail || "")
        .trim()
        .toLowerCase();
      const customerName = String(request.data?.customerName || "").trim();
      const durationWeeks = normalizeBookingDuration(request.data?.durationWeeks);

      const session = await createExternalCheckoutSession({
        customerEmail,
        customerName,
        durationWeeks,
      });

      return {
        url: session.url,
        sessionId: session.sessionId,
      };
    } catch (error) {
      console.error("createExternalBookingCheckoutSession error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error
          ? error.message
          : "Could not create external booking checkout session."
      );
    }
  }
);

export const startExternalBookingCheckout = onRequest(
  { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      const customerEmail = String(req.query.email || "")
        .trim()
        .toLowerCase();
      const customerName = String(req.query.name || "").trim();
      const durationWeeks = normalizeBookingDuration(req.query.durationWeeks);

      const session = await createExternalCheckoutSession({
        customerEmail,
        customerName,
        durationWeeks,
      });

      if (!session.url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      res.redirect(303, session.url);
    } catch (error) {
      console.error("startExternalBookingCheckout error:", error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not create external booking checkout.",
      });
    }
  }
);

export const finalizeExternalBookingCheckout = onRequest(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL"],
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      const sessionId = String(req.query.session_id || "").trim();
      const stripeAccountId = String(req.query.account_id || "").trim();

      if (!sessionId || !stripeAccountId) {
        res.status(400).send("Missing session_id or account_id.");
        return;
      }

      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(
        sessionId,
        {},
        {
          stripeAccount: stripeAccountId,
        }
      );

      const flow = String(session.metadata?.flow || "").trim();

      if (flow === "external_entitlement" && session.payment_status === "paid") {
        await fulfillExternalEntitlementCheckoutSession(session);
      }

      res.redirect(
        303,
        resolveCheckoutReturnUrl(
          "/book?checkout=external-success",
          "/book?checkout=external-success"
        )
      );
    } catch (error) {
      console.error("finalizeExternalBookingCheckout error:", error);
      res.redirect(
        303,
        resolveCheckoutReturnUrl(
          "/book?checkout=external-error",
          "/book?checkout=external-error"
        )
      );
    }
  }
);

export const createUserBooking = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const durationWeeks = normalizeBookingDuration(request.data?.durationWeeks);
      const startWeekId = String(request.data?.startWeekId || "").trim();
      const notes = String(request.data?.notes || "").trim();

      if (!startWeekId) {
        throw new HttpsError("invalid-argument", "startWeekId is required.");
      }

      const [context, bookingUser, pricing] = await Promise.all([
        loadBookingContext(),
        resolveBookingUser(request.auth.uid),
        loadBookingPricing(),
      ]);

      const selectedWeeks = getConsecutiveBookingWeeks(
        context.weeks,
        startWeekId,
        durationWeeks
      );
      const price = getBookingPriceForDuration(pricing, durationWeeks);

      const hasOverlappingBooking = context.bookings.some((booking) => {
        if (String(booking.userId || "") !== request.auth.uid) {
          return false;
        }

        if (booking.status === "cancelled" || !Array.isArray(booking.weekIds)) {
          return false;
        }

        return selectedWeeks.some((week) => booking.weekIds.includes(week.id));
      });

      if (hasOverlappingBooking) {
        throw new HttpsError(
          "failed-precondition",
          "You already have a booking covering one or more of these weeks."
        );
      }

      const payload = {
        startWeekId,
        weekIds: selectedWeeks.map((week) => week.id),
        durationWeeks,
        status: "pending",
        source: "public",
        paymentStatus: "pending",
        paymentMethod: "stripe",
        consumesCapacity: true,
        customerName: bookingUser.customerName,
        customerEmail: bookingUser.customerEmail,
        userId: bookingUser.userId,
        profileId: bookingUser.profileId || "",
        shortStay: false,
        shortStayNights: null,
        customPrice: price.amount,
        currency: price.currency,
        notes,
      };

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
        amount: payload.customPrice,
        currency: payload.currency,
        durationWeeks: payload.durationWeeks,
      };
    } catch (error) {
      console.error("createUserBooking error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Booking creation failed."
      );
    }
  }
);

export const notifyInboxMessageCreated = onDocumentCreated(
  {
    region: "us-central1",
    document: "messageThreads/{threadId}/messages/{messageId}",
  },
  async (event) => {
    try {
      const messageSnap = event.data;
      if (!messageSnap?.exists) {
        return;
      }

      const { threadId } = event.params;
      const message = messageSnap.data() || {};
      const threadSnap = await db.collection("messageThreads").doc(threadId).get();

      if (!threadSnap.exists) {
        return;
      }

      const thread = threadSnap.data() || {};
      const senderUid = String(message.senderUid || "").trim();
      const senderRole = String(message.senderRole || "").trim();
      const senderName = String(message.senderName || "").trim();
      const subject = String(thread.subject || "").trim() || "New message";
      const preview = String(message.body || "").trim();

      let targetUserIds = [];

      if (senderRole === "user") {
        targetUserIds = await getActiveUserIdsByRoles(
          getThreadRecipientRoles(String(thread.category || "general"))
        );
      } else {
        const clientUserId = String(thread.clientUserId || "").trim();
        targetUserIds = clientUserId ? [clientUserId] : [];
      }

      const filteredTargets = targetUserIds.filter((userId) => userId && userId !== senderUid);

      if (filteredTargets.length === 0) {
        return;
      }

      const title =
        senderRole === "user"
          ? `Client message: ${subject}`
          : `New message from ${senderName || "staff"}`;

      const body = preview
        ? preview.slice(0, 160)
        : "You have a new message in your inbox.";

      await sendPushToUserIds({
        userIds: filteredTargets,
        title,
        body,
        url: "/",
        createdBy: senderUid,
        metadata: {
          source: "messages",
          threadId,
          messageId: messageSnap.id,
          senderRole,
          category: String(thread.category || "general"),
        },
      });
    } catch (error) {
      console.error("notifyInboxMessageCreated error:", error);
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

async function fulfillInternalBookingCheckoutSession(session) {
  if (session.payment_status !== "paid") {
    return;
  }

  const bookingId =
    String(session.metadata?.bookingId || "").trim() ||
    String(session.client_reference_id || "").trim();

  if (!bookingId) {
    throw new Error("Missing bookingId metadata on internal booking checkout session.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();

  if (!bookingSnap.exists) {
    throw new Error(`Booking ${bookingId} not found for checkout session ${session.id}.`);
  }

  const bookingData = bookingSnap.data() || {};

  if (bookingData.paymentStatus === "paid" && bookingData.status === "confirmed") {
    return;
  }

  await bookingRef.set(
    {
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "stripe",
      checkoutStatus: "complete",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: String(session.payment_intent || "").trim(),
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function fulfillExternalEntitlementCheckoutSession(session) {
  if (session.payment_status !== "paid") {
    return;
  }

  const existingSnap = await db
    .collection("bookingEntitlements")
    .where("stripeCheckoutSessionId", "==", session.id)
    .limit(1)
    .get();

  let entitlementRef;
  let entitlementData;

  if (existingSnap.empty) {
    const durationWeeks = normalizeBookingDuration(session.metadata?.durationWeeks);
    const customerEmail = String(
      session.metadata?.customerEmail ||
        session.customer_details?.email ||
        session.customer_email ||
        ""
    )
      .trim()
      .toLowerCase();
    const customerName = String(
      session.metadata?.customerName || session.customer_details?.name || ""
    ).trim();
    const amountTotal =
      typeof session.amount_total === "number" ? session.amount_total / 100 : null;
    const currency =
      String(session.currency || "eur").trim().toUpperCase() || "EUR";

    if (!isValidEmailAddress(customerEmail)) {
      throw new Error(
        `Missing valid customer email for external entitlement session ${session.id}.`
      );
    }

    const code = await generateUniqueBookingEntitlementCode();
    entitlementRef = db.collection("bookingEntitlements").doc(code);
    entitlementData = {
      code,
      customerEmail,
      customerName,
      durationWeeks,
      amount: amountTotal,
      currency,
      status: "issued",
      source: "external",
      notes: "Created automatically from Stripe Checkout.",
      stripeAccountId: String(session.metadata?.connectedAccountId || "").trim(),
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: String(session.payment_intent || "").trim(),
      emailDeliveryStatus: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await entitlementRef.set(entitlementData);
  } else {
    entitlementRef = existingSnap.docs[0].ref;
    entitlementData = existingSnap.docs[0].data() || {};
  }

  if (entitlementData.emailSentAt) {
    return;
  }

  const code = String(entitlementData.code || entitlementRef.id || "");
  const customerEmail = String(entitlementData.customerEmail || "").trim().toLowerCase();
  const customerName = String(entitlementData.customerName || "").trim();
  const durationWeeks = normalizeBookingDuration(entitlementData.durationWeeks);
  const amount =
    typeof entitlementData.amount === "number" ? entitlementData.amount : 0;
  const currency = String(entitlementData.currency || "EUR").trim().toUpperCase();

  const emailResult = await sendBookingEntitlementEmail({
    code,
    customerEmail,
    customerName,
    durationWeeks,
    amount,
    currency,
  });

  await entitlementRef.set(
    {
      emailDeliveryStatus: "sent",
      emailMessageId: String(emailResult?.id || "").trim(),
      emailSentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function handleStripeWebhookRequest(req, res, webhookSecret) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const stripe = getStripeClient();
    const signatureHeader = req.headers["stripe-signature"];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    if (!signature) {
      res.status(400).send("Missing Stripe-Signature header.");
      return;
    }

    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      webhookSecret
    );

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      const flow = String(session.metadata?.flow || "").trim();

      if (flow === "internal_booking") {
        await fulfillInternalBookingCheckoutSession(session);
      } else if (flow === "external_entitlement") {
        await fulfillExternalEntitlementCheckoutSession(session);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("stripe webhook error:", error);
    res.status(400).send(
      error instanceof Error ? error.message : "Webhook handling failed."
    );
  }
}

export const stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
    ],
  },
  async (req, res) => handleStripeWebhookRequest(req, res, getStripeWebhookSecret())
);

export const stripeConnectWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [
      "STRIPE_SECRET_KEY",
      "STRIPE_CONNECT_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
    ],
  },
  async (req, res) =>
    handleStripeWebhookRequest(req, res, getStripeConnectWebhookSecret())
);

export const createStripeConnectAuthorizeUrl = onCall(
  { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => {
    try {
      await assertAdmin(request.auth);

      const stripe = getStripeClient();
      const paymentsRef = db.collection("settings").doc("payments");
      const paymentsSnap = await paymentsRef.get();
      const paymentsData = paymentsSnap.exists ? paymentsSnap.data() || {} : {};
      const existingAccountId = String(paymentsData.stripeAccountId || "").trim();

      const account = existingAccountId
        ? await stripe.accounts.retrieve(existingAccountId)
        : await stripe.accounts.create({
            type: "standard",
            metadata: {
              platform: "bootcamp-platform",
            },
          });

      await paymentsRef.set(
        buildStripeAccountSnapshot(account, paymentsData),
        { merge: true }
      );

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: getStripeAdminRefreshUrl(),
        return_url: getStripeAdminReturnUrl(),
        type: "account_onboarding",
      });

      return {
        url: accountLink.url,
        stripeAccountId: account.id,
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
  { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
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

      const { account, snapshot } = await syncStripeAccountSettings({
        stripe,
        paymentsRef,
        paymentsData,
        stripeAccountId: tokenResponse.stripe_user_id,
        extra: {
          connectionMode: "oauth",
          livemode: Boolean(tokenResponse.livemode),
          scope: tokenResponse.scope || "read_write",
        },
      });

      return {
        stripeAccountId: tokenResponse.stripe_user_id,
        livemode: Boolean(tokenResponse.livemode),
        scope: tokenResponse.scope || "read_write",
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        detailsSubmitted: Boolean(account.details_submitted),
        onboardingComplete: Boolean(snapshot.onboardingComplete),
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
  { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
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

      const { account, snapshot } = await syncStripeAccountSettings({
        stripe,
        paymentsRef,
        paymentsData,
        stripeAccountId,
      });

      return {
        stripeAccountId: account.id,
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        detailsSubmitted: Boolean(account.details_submitted),
        onboardingComplete: Boolean(snapshot.onboardingComplete),
        requirementsCurrentlyDue: snapshot.requirementsCurrentlyDue,
        requirementsPastDue: snapshot.requirementsPastDue,
        requirementsPendingVerification:
          snapshot.requirementsPendingVerification,
        requirementsDisabledReason: snapshot.requirementsDisabledReason,
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
