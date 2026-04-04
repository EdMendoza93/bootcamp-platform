import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type QaAccount = {
  role: "admin" | "coach" | "nutritionist" | "user";
  email: string;
  password: string;
};

type QaUsersFile = {
  accounts: QaAccount[];
};

const QA_USERS_FILE = process.env.QA_USERS_FILE || "/tmp/bootcamp-qa-users.json";

function loadQaAccounts() {
  if (!fs.existsSync(QA_USERS_FILE)) {
    throw new Error(
      `Missing QA users file at ${QA_USERS_FILE}. Run scripts/create-qa-users.mjs first.`
    );
  }

  const data = JSON.parse(fs.readFileSync(QA_USERS_FILE, "utf8")) as QaUsersFile;
  return data.accounts;
}

async function expectUrlContains(page: Page, value: string) {
  await expect
    .poll(() => page.url(), {
      message: `Expected URL to contain "${value}"`,
    })
    .toContain(value);
}

async function login(page: Page, account: QaAccount) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(account.email);
  await page.getByPlaceholder("••••••••").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const expectedHomeByRole: Record<QaAccount["role"], string> = {
  admin: "/admin",
  coach: "/staff",
  nutritionist: "/staff",
  user: "/dashboard",
};

const accounts = loadQaAccounts();

for (const account of accounts) {
  test.describe(`role:${account.role}`, () => {
    test(`lands on ${expectedHomeByRole[account.role]} after login`, async ({
      page,
    }) => {
      await login(page, account);
      await expectUrlContains(page, expectedHomeByRole[account.role]);
    });

    test("protected routes enforce role boundaries", async ({ page }) => {
      await login(page, account);
      await expectUrlContains(page, expectedHomeByRole[account.role]);

      await page.goto("/admin");
      if (account.role === "admin") {
        await expectUrlContains(page, "/admin");
      } else {
        await expectUrlContains(page, expectedHomeByRole[account.role]);
      }

      await page.goto("/staff");
      if (account.role === "admin" || account.role === "coach" || account.role === "nutritionist") {
        await expectUrlContains(page, "/staff");
      } else {
        await expectUrlContains(page, "/dashboard");
      }

      await page.goto("/dashboard");
      if (account.role === "user") {
        await expectUrlContains(page, "/dashboard");
      } else {
        await expectUrlContains(page, expectedHomeByRole[account.role]);
      }
    });
  });
}
