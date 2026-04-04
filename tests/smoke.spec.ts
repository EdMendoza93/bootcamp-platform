import { expect, test, type Page } from "@playwright/test";

async function expectUrlContains(page: Page, value: string) {
  await expect
    .poll(() => page.url(), {
      message: `Expected URL to contain "${value}"`,
    })
    .toContain(value);
}

test.describe("smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  test("dashboard redirects unauthenticated users to login with next param", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expectUrlContains(page, "/login");
    await expectUrlContains(page, "next=%2Fdashboard");
  });

  test("admin redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/admin");

    await expectUrlContains(page, "/login");
  });

  test("staff redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/staff");

    await expectUrlContains(page, "/login");
  });

  test("book route preserves intent through login redirect", async ({ page }) => {
    await page.goto("/book?durationWeeks=2");

    await expectUrlContains(page, "/login");
    await expectUrlContains(page, "next=%2Fdashboard%2Fbook%3FdurationWeeks%3D2");
  });
});
