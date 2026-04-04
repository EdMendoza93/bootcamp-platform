import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FIREBASE_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "AIzaSyAc9WUQzLLGXdjCXXpvi7paqTFRHwc0E5M";
const FIREBASE_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bootcamp-platform-27d16";
const DEFAULT_PASSWORD = process.env.QA_TEST_PASSWORD || "BootcampQA!2026";
const DEFAULT_TAG = process.env.QA_TEST_TAG || "qa";

const roles = [
  { role: "admin", name: "QA Admin", slug: "admin" },
  { role: "coach", name: "QA Coach", slug: "coach" },
  { role: "nutritionist", name: "QA Nutritionist", slug: "nutritionist" },
  { role: "user", name: "QA Client", slug: "client" },
];

function readFirebaseAccessToken() {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json"
  );

  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  const accessToken = config?.tokens?.access_token;

  if (!accessToken) {
    throw new Error(
      "Missing Firebase CLI access token. Run `firebase login` first."
    );
  }

  return accessToken;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.status ||
      `${response.status} ${response.statusText}`;
    throw new Error(`${options.method || "GET"} ${url} failed: ${message}`);
  }

  return data;
}

async function createOrSignInUser(email, password) {
  const signupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;

  try {
    return await requestJson(signupUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });
  } catch (error) {
    if (!String(error.message).includes("EMAIL_EXISTS")) {
      throw error;
    }
  }

  const signinUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

  return requestJson(signinUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
}

async function upsertUserDoc({ uid, email, role, name }, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const now = new Date().toISOString();

  return requestJson(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      fields: {
        email: { stringValue: email },
        name: { stringValue: name },
        role: { stringValue: role },
        status: { stringValue: "active" },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
      },
    }),
  });
}

async function run() {
  const accessToken = readFirebaseAccessToken();
  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const accounts = [];

  for (const item of roles) {
    const email = `${DEFAULT_TAG}.${item.slug}.${dateTag}@example.com`;
    const authUser = await createOrSignInUser(email, DEFAULT_PASSWORD);

    await upsertUserDoc(
      {
        uid: authUser.localId,
        email,
        role: item.role,
        name: item.name,
      },
      accessToken
    );

    accounts.push({
      role: item.role,
      email,
      password: DEFAULT_PASSWORD,
      uid: authUser.localId,
    });
  }

  console.log(JSON.stringify({ projectId: FIREBASE_PROJECT_ID, accounts }, null, 2));
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
