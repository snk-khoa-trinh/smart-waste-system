import { expect, test } from "@playwright/test";

test("dashboard supports collections, JPEG classification and separate outcomes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Collection overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Select Atrium 1 on/ }),
  ).toBeVisible();
  await page.goto("/records?station=s11&view=collections");
  await page.getByLabel("Collected by").fill("Browser verification");
  const note = `Synthetic local QA ${Date.now()}`;
  await page.getByLabel("Collection note").fill(note);
  await page.getByRole("button", { name: "Record collection" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Collection saved." }),
  ).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.goto("/inference?station=s11");
  // Generate the JPEG using browser canvas rather than a checked-in binary fixture.
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  await page.getByLabel("JPEG image").setInputFiles({
    name: "synthetic.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(image, "base64"),
  });
  await page
    .getByRole("combobox", { name: "Repeatable mock scenario" })
    .click();
  await page.getByRole("option", { name: "battery", exact: true }).click();
  await page.getByRole("button", { name: "Classify image" }).click();
  await expect(page.locator(".result")).toContainText("E-waste");
  await expect(
    page.getByRole("heading", { name: "Sorting activity" }),
  ).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Building", exact: true }).click();
  await page
    .getByRole("option", { name: "Innovation Campus", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Floor", exact: true }).click();
  await page.getByRole("option", { name: "Level 02", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Select Atrium 2 on/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Select Atrium 1 on/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const width of [375, 667, 768, 1440]) {
  test(`dashboard fits a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 950 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /^Select Atrium 1 on/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    });
  });
}
