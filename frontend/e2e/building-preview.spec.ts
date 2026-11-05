import { expect, test } from "@playwright/test";
const buildings = [
  { id: "campus", name: "Innovation Campus" },
  { id: "mall", name: "Central Mall" },
];
const floors = buildings.flatMap((building) =>
  Array.from({ length: building.id === "mall" ? 3 : 2 }, (_, i) => ({
    id: `${building.id === "campus" ? "floor" : "mall-floor"}-${i + 1}`,
    building_id: building.id,
    name: `Level 0${i + 1}`,
  })),
);
const stations = floors.flatMap((floor) => {
  const level = Number(floor.id.split("-").at(-1));
  const mall = floor.building_id === "mall";
  return Array.from({ length: mall && level < 3 ? 3 : 2 }, (_, i) => {
    const id = `${mall ? "m" : "s"}${level}${i + 1}`;
    return {
      id,
      name: `${mall ? "Mall" : "Campus"} bin ${level}${i + 1}`,
      floor_id: floor.id,
      x: i === 0 ? 25 : 72,
      y: i < 2 ? (level === 1 ? 35 : 65) : level === 1 ? 65 : 35,
      compartments: ["recyclable", "non_recyclable", "e_waste"].map(
        (category) => ({
          category,
          source:
            id === "s11" && category === "recyclable" ? "sensor" : "simulated",
          fill: 40,
          quality: "valid",
          stale: false,
          measured_at: new Date().toISOString(),
        }),
      ),
      devices: [
        {
          id: `${id}-cam`,
          role: "camera_sorter",
          online: true,
          last_seen: new Date().toISOString(),
        },
        {
          id: `${id}-monitor`,
          role: "fill_monitor",
          online: true,
          last_seen: new Date().toISOString(),
        },
      ],
    };
  });
});
test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    expect(route.request().method()).toBe("GET");
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/buildings"
        ? buildings
        : path === "/api/floors"
          ? floors
          : path === "/api/stations"
            ? stations
            : path === "/api/ready"
              ? { status: "ready" }
              : path === "/api/summary"
                ? { inference_provider: "roboflow" }
                : [];
    await route.fulfill({ json });
  });
});
test("2D campus and mall floors share selectable bin coordinates", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.getByRole("region", { name: "Building preview" });
  await expect(preview).toContainText("Innovation Campus");
  await expect(
    preview.getByRole("combobox", { name: "Building", exact: true }),
  ).toContainText("Innovation Campus");
  await expect(
    preview.getByRole("group", { name: /floor plan/ }),
  ).toBeVisible();
  await expect(preview.getByText("ENTRANCE", { exact: true })).toBeVisible();
  await expect(preview.getByText("ELEVATOR", { exact: true })).toBeVisible();
  await preview
    .getByRole("button", {
      name: "Select Campus bin 12 on Level 01",
      exact: true,
    })
    .click();
  await expect(
    preview.getByRole("button", {
      name: "Select Campus bin 12 on Level 01",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await preview.getByRole("combobox", { name: "Floor", exact: true }).click();
  await page.getByRole("option", { name: "Level 02", exact: true }).click();
  await expect(
    preview.getByRole("button", {
      name: "Select Campus bin 21 on Level 02",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Building", exact: true }).click();
  await page.getByRole("option", { name: "Central Mall", exact: true }).click();
  await expect(
    preview.getByRole("combobox", { name: "Building", exact: true }),
  ).toContainText("Central Mall");
  await preview.getByRole("combobox", { name: "Floor", exact: true }).click();
  await page.getByRole("option", { name: "Level 03", exact: true }).click();
  await expect(
    preview.getByRole("button", {
      name: "Select Mall bin 31 on Level 03",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/building-2d-mall.png",
    fullPage: true,
  });
});
test("3D renders, highlights and selects bins, rotates, zooms and isolates floors", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  await page.goto("/");
  const preview = page.getByRole("region", { name: "Building preview" });
  await preview.getByRole("tab", { name: "3D", exact: true }).click();
  const canvas = preview.locator('canvas[data-renderer="webgl"]');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  const bin = preview.getByRole("button", {
    name: "Select 3D bin Campus bin 12",
    exact: true,
  });
  await expect(bin).toBeVisible({ timeout: 15000 });
  await bin.hover();
  await expect(bin).toHaveAttribute("data-highlighted", "true");
  await bin.click();
  await expect(bin).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/building-3d-campus.png",
    fullPage: true,
  });
  const before = await canvas.screenshot();
  await preview.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForTimeout(300);
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.75,
    bounds.y + bounds.height * 0.75,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.4,
    bounds.y + bounds.height * 0.6,
    { steps: 12 },
  );
  await page.mouse.up();
  await preview
    .getByRole("button", { name: "Reset 3D view", exact: true })
    .click();
  await preview
    .getByRole("button", { name: "Floors separated", exact: true })
    .click();
  await expect(
    preview.getByRole("button", { name: "Floors stacked", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Building", exact: true }).click();
  await page.getByRole("option", { name: "Central Mall", exact: true }).click();
  await expect(
    preview.getByRole("combobox", { name: "Building", exact: true }),
  ).toContainText("Central Mall");
  await expect(
    preview.getByRole("button", { name: /Select 3D bin Mall/ }),
  ).toHaveCount(8);
  await expect(
    preview.getByRole("button", { name: "Floors separated", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/building-3d-mall.png",
    fullPage: true,
  });
  await preview.getByRole("combobox", { name: "Floor", exact: true }).click();
  await page.getByRole("option", { name: "Level 03", exact: true }).click();
  await expect(
    preview.getByRole("button", { name: /Select 3D bin Mall/ }),
  ).toHaveCount(2);
  await preview.getByRole("tab", { name: "2D", exact: true }).click();
  await expect(
    preview.getByRole("group", { name: /floor plan/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe("mobile building preview", () => {
  test.use({
    viewport: { width: 375, height: 850 },
    hasTouch: true,
    colorScheme: "dark",
  });
  test("touch selection works and a lost graphics context offers 2D", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const preview = page.getByRole("region", { name: "Building preview" });
    await expect(preview.locator("canvas")).toHaveCount(0);
    await preview.getByRole("tab", { name: "3D", exact: true }).tap();
    const canvas = preview.locator('canvas[data-renderer="webgl"]');
    await expect(canvas).toBeVisible({ timeout: 30000 });
    const bin = preview.getByRole("button", {
      name: "Select 3D bin Campus bin 12",
      exact: true,
    });
    await bin.tap();
    await expect(bin).toHaveAttribute("aria-pressed", "true");
    const details = page.getByRole("dialog", {
      name: "Campus bin 12",
      exact: true,
    });
    await expect(details).toBeVisible();
    await expect
      .poll(async () => (await details.boundingBox())!.x)
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => {
        const bounds = (await details.boundingBox())!;
        return bounds.x + bounds.width;
      })
      .toBeLessThanOrEqual(375);
    await preview.getByRole("button", { name: "Zoom out", exact: true }).tap();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await preview.screenshot({
      path: "test-results/building-3d-mobile-dark.png",
    });
    await canvas.evaluate((element) =>
      element.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      ),
    );
    await expect(
      preview.getByText("3D graphics are unavailable on this device.", {
        exact: true,
      }),
    ).toBeVisible();
    await preview
      .getByRole("button", { name: "Use 2D floor plan", exact: true })
      .tap();
    await expect(
      preview.getByRole("group", { name: /floor plan/ }),
    ).toBeVisible();
  });
});

test("bin popovers replace overview cards and link to the selected bin", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator("main .station-card, main .station-list"),
  ).toHaveCount(0);
  const preview = page.getByRole("region", { name: "Building preview" });
  await preview
    .getByRole("button", {
      name: "Select Campus bin 12 on Level 01",
      exact: true,
    })
    .click();
  const popup = page.getByRole("dialog", {
    name: "Campus bin 12",
    exact: true,
  });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Demo bin");
  await expect(
    popup.getByRole("link", { name: "Open bin", exact: true }),
  ).toHaveAttribute("href", "/bins/s12");
  const bounds = (await popup.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  await page
    .getByRole("button", { name: "Close bin details", exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  await expect(preview.locator(".preview-heading")).toHaveCount(1);
  await expect(preview.locator(".preview-controls")).toHaveCount(1);
  await expect(
    preview.locator(".model-toolbar,.preview-caption,.model-instructions"),
  ).toHaveCount(0);
  await page.route("**/api/stations/s12", (route) =>
    route.fulfill({ json: stations.find((bin) => bin.id === "s12") }),
  );
  await preview
    .getByRole("button", {
      name: "Select Campus bin 12 on Level 01",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Campus bin 12", exact: true })
    .getByRole("link", { name: "Open bin", exact: true })
    .click();
  await expect(page).toHaveURL(/\/bins\/s12$/);
  await expect(
    page.getByRole("heading", { name: "Campus bin 12", exact: true }),
  ).toBeVisible();
});
