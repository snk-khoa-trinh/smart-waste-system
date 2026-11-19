import { expect, test } from "@playwright/test";
const station = {
  id: "s11",
  name: "Atrium 1",
  floor_id: "floor-1",
  x: 25,
  y: 30,
  devices: [
    {
      id: "s11-cam",
      role: "camera_sorter",
      online: true,
      last_seen: new Date().toISOString(),
    },
    {
      id: "s11-monitor",
      role: "fill_monitor",
      online: true,
      last_seen: new Date().toISOString(),
    },
  ],
  compartments: ["recyclable", "non_recyclable", "e_waste"].map((category) => ({
    category,
    fill: 45,
    quality: "valid",
    source: category === "recyclable" ? "sensor" : "simulated",
    stale: false,
    measured_at: new Date().toISOString(),
  })),
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    expect(route.request().method()).toBe("GET");
    const path = new URL(route.request().url()).pathname;
    const data =
      path === "/api/inference/config"
        ? {
            provider: "mock",
            max_upload_bytes: 2000000,
            max_pixels: 20000000,
            confidence_threshold: 0.65,
          }
        : path === "/api/ready"
          ? { status: "ready" }
          : path === "/api/summary"
            ? {
                stations: 1,
                devices_offline: 0,
                needing_collection: 0,
                inference_provider: "roboflow",
              }
            : path === "/api/stations"
              ? [station]
              : path === "/api/stations/s11"
                ? station
                : path === "/api/buildings"
                  ? [{ id: "building-1", name: "Main building" }]
                  : path === "/api/floors"
                    ? [
                        {
                          id: "floor-1",
                          building_id: "building-1",
                          name: "Level 01",
                        },
                      ]
                    : path.endsWith("/telemetry")
                      ? [
                          {
                            id: "reading-1",
                            category: "recyclable",
                            fill: 45,
                            quality: "valid",
                            source: "sensor",
                            measured_at: new Date().toISOString(),
                          },
                        ]
                      : path === "/api/events"
                        ? [
                            {
                              id: "event-1",
                              decision: "e_waste",
                              confidence: 0.85,
                              provider: "roboflow",
                              model: "test",
                              raw_label: "E-Waste",
                              reason: null,
                              outcome: "completed",
                              simulated: false,
                              created_at: new Date().toISOString(),
                            },
                          ]
                        : [];
    await route.fulfill({ json: data });
  });
});
test("routes, station links, browser history and direct refresh", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Collection overview" }),
  ).toBeVisible();
  await expect(
    page.getByText("Record a collection", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Bins", exact: true }).click();
  await expect(page).toHaveURL(/\/bins$/);
  await page.getByRole("link", { name: /Atrium 1/ }).click();
  await expect(page).toHaveURL(/\/bins\/s11$/);
  await expect(
    page.getByRole("heading", { name: "Fill history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Record collection", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator("main")
      .getByRole("link", { name: "Inference lab", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Atrium 1", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/bins$/);
  await page
    .getByRole("link", { name: "Inference lab", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("JPEG image")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Report simulated/ }),
  ).toHaveCount(0);
  await page.goto("/missing");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("desktop sidebar and light/dark/system preferences persist", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const sidebar = page.locator("[data-state][data-collapsible]");
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await page
    .getByRole("button", { name: "Toggle Sidebar", exact: true })
    .first()
    .click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCSS("width", "48px");
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.getByRole("button", { name: /Change theme/ }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: /Change theme/ }).click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: /Change theme/ }).click();
  await page
    .getByRole("menuitemradio", { name: "System", exact: true })
    .click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
for (const width of [375, 667, 768, 1440]) {
  test(`routes fit ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 950 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const path of [
        "/",
        "/bins",
        "/bins/s11",
        "/records?station=s11",
        "/records?station=s11&view=collections",
        "/inference?station=s11",
      ]) {
        await page.goto(path);
        await expect(page.locator("main h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.goto("/");
      await expect(
        page.getByRole("button", { name: /^Select Atrium 1 on/ }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/routes-${width}-${colorScheme}.png`,
        fullPage: true,
      });
    }
    if (width < 768) {
      await page
        .getByRole("button", { name: "Toggle Sidebar", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("link", { name: "Records", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Records", exact: true }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Collections", exact: true }).click();
      await expect(page.getByLabel("Collected by")).toBeVisible();
      await page
        .getByRole("button", { name: "Toggle Sidebar", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
}

test("records tabs and legacy links preserve the selected bin", async ({
  page,
}) => {
  await page.goto("/stations/s11");
  await expect(page).toHaveURL(/\/bins\/s11$/);
  await page.goto("/collections?station=s11");
  await expect(page).toHaveURL(/\/records\?station=s11&view=collections$/);
  await expect(
    page.getByRole("tab", { name: "Collections", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Sorting", exact: true }).click();
  await expect(page).toHaveURL(/view=sorting/);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Bin", exact: true }),
  ).toContainText("Atrium 1");
  await expect(
    page.getByRole("tab", { name: "Sorting", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-event-id="event-1"]')).toContainText(
    "completed",
  );
  await expect(
    page.getByRole("link", {
      name: "@snk-khoa-trinh on GitHub (opens in a new tab)",
    }),
  ).toHaveAttribute("href", "https://github.com/snk-khoa-trinh");
  await expect(page.getByText("Tools", { exact: true })).toBeVisible();
});

test("prototype popup shows independent brain and camera heartbeats", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prototype status", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "Prototype status" });
  await expect(popup).toBeVisible();
  await expect(popup.getByText("Brain (ESP32)", { exact: true })).toBeVisible();
  await expect(
    popup.getByText("Camera (ESP32-CAM)", { exact: true }),
  ).toBeVisible();
  await expect(popup.getByText("Online", { exact: true })).toHaveCount(2);
  await expect(popup.getByText("Ready", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 800 });
  await page
    .getByRole("button", { name: "Toggle Sidebar", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Prototype status", exact: true })
    .click();
  await expect(popup).toBeVisible();
  const bounds = await popup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
});
test("collection overlays dim demo and stale bins and show precise details", async ({
  page,
}) => {
  const makeBin = (
    id: string,
    source: string,
    fill: number,
    stale = false,
    x = 25,
  ) => ({
    ...station,
    id,
    name: id,
    x,
    compartments: [{ ...station.compartments[0], source, fill, stale }],
  });
  await page.route("**/api/stations", (route) =>
    route.fulfill({
      json: [
        makeBin("full-bin", "sensor", 90),
        makeBin("stale-bin", "sensor", 95, true, 50),
        makeBin("demo-bin", "simulated", 100, false, 72),
      ],
    }),
  );
  await page.goto("/");
  const collect = page.getByRole("button", {
    name: "Collection alerts: 1",
    exact: true,
  });
  const checking = page.getByRole("button", {
    name: "Needs checking: 1",
    exact: true,
  });
  await collect.click();
  const full = page.getByRole("button", {
    name: "Select full-bin on Level 01",
    exact: true,
  });
  const stale = page.getByRole("button", {
    name: "Select stale-bin on Level 01",
    exact: true,
  });
  const demo = page.getByRole("button", {
    name: "Select demo-bin on Level 01",
    exact: true,
  });
  await expect(full).toHaveAttribute("data-dimmed", "false");
  await expect(stale).toHaveAttribute("data-dimmed", "true");
  await expect(demo).toHaveAttribute("data-dimmed", "true");
  await checking.click();
  await expect(stale).toHaveAttribute("data-dimmed", "false");
  await stale.click();
  await expect(
    page.getByRole("dialog", { name: "stale-bin", exact: true }),
  ).toContainText("Out of date");
  await page
    .getByRole("button", { name: "Close bin details", exact: true })
    .click();
  await checking.click();
  await expect(demo).toHaveAttribute("data-dimmed", "false");
});

test("location selects update the heading and notes open from info icons", async ({
  page,
  browser,
}) => {
  await page.route("**/api/buildings", (route) =>
    route.fulfill({
      json: [
        { id: "building-1", name: "Main building" },
        { id: "building-2", name: "Second building" },
      ],
    }),
  );
  await page.route("**/api/floors", (route) =>
    route.fulfill({
      json: [
        { id: "floor-1", building_id: "building-1", name: "Level 01" },
        {
          id: "floor-2",
          building_id: "building-2",
          name: "Second building floor",
        },
      ],
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "Floor", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("combobox", { name: "Building", exact: true }),
  ).toContainText("Main building");
  await page.getByRole("combobox", { name: "Building", exact: true }).click();
  await page
    .getByRole("option", { name: "Main building", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Building", exact: true }),
  ).toContainText("Main building");
  await page.getByRole("combobox", { name: "Floor", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Second building floor", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "Level 01", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Floor", exact: true }),
  ).toContainText("Level 01");
  await page.getByRole("combobox", { name: "Building", exact: true }).click();
  await page
    .getByRole("option", { name: "Second building", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Floor", exact: true }),
  ).toContainText("Second building floor");
  await expect(
    page.getByRole("combobox", { name: "Building", exact: true }),
  ).toContainText("Second building");
  await page.getByRole("combobox", { name: "Floor", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Level 01", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: "Second building floor", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Floor", exact: true }),
  ).toContainText("Second building floor");
  await page.getByRole("combobox", { name: "Building", exact: true }).click();
  await page
    .getByRole("option", { name: "Main building", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Floor", exact: true }),
  ).toContainText("Level 01");
  await expect(
    page.getByRole("combobox", { name: "Floor", exact: true }),
  ).toBeEnabled();
  const alertNote = page
    .getByRole("tooltip")
    .filter({ hasText: "Alerts exclude demo data" });
  await expect(alertNote).toHaveCount(0);
  await page
    .getByRole("button", { name: "About collection alerts", exact: true })
    .hover();
  await expect(alertNote).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Prototype status", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "Prototype status" });
  const hardwareNote = page
    .getByRole("tooltip")
    .filter({ hasText: "Board status comes from backend heartbeats" });
  await expect(hardwareNote).toHaveCount(0);
  await popup
    .getByRole("button", { name: "About hardware status", exact: true })
    .focus();
  await expect(hardwareNote).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const touchContext = await browser.newContext({
    viewport: { width: 375, height: 800 },
    hasTouch: true,
  });
  const touchPage = await touchContext.newPage();
  await touchPage.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/buildings"
          ? [{ id: "building-1", name: "Main building" }]
          : path === "/api/floors"
            ? [{ id: "floor-1", building_id: "building-1", name: "Level 01" }]
            : path === "/api/stations"
              ? [station]
              : [],
    });
  });
  await touchPage.goto(page.url());
  await touchPage
    .getByRole("button", { name: "About collection alerts", exact: true })
    .tap();
  await expect(
    touchPage
      .getByRole("tooltip")
      .filter({ hasText: "Alerts exclude demo data" }),
  ).toBeVisible();
  await touchContext.close();
});

test("footer refreshes displayed data and reports failures and offline state", async ({
  page,
  context,
}) => {
  let requests = 0;
  let fail = false;
  await page.route("**/api/stations", async (route) => {
    expect(route.request().method()).toBe("GET");
    requests++;
    await route.fulfill(
      fail
        ? { status: 503, json: { detail: "Unavailable" } }
        : { json: [station] },
    );
  });
  await page.goto("/");
  const footer = page.locator('footer[aria-label="Data status"]');
  await expect(footer.getByRole("status")).toHaveText("Data refreshed");
  await expect(footer.locator("time")).toBeVisible();
  const before = requests;
  await footer.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
  await expect(footer.getByRole("status")).toHaveText("Data refreshed");
  fail = true;
  await footer.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(footer.getByRole("status")).toHaveText("Refresh failed");
  await expect(footer.locator("time")).toBeVisible();
  fail = false;
  await footer.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(footer.getByRole("status")).toHaveText("Data refreshed");
  await context.setOffline(true);
  await expect(footer.getByRole("status")).toHaveText("Browser offline");
  await expect(
    footer.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(footer).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("bin filters combine location, search, connection and sensor tasks", async ({
  page,
}) => {
  const other = {
    ...station,
    id: "m11",
    name: "Mall entrance",
    floor_id: "mall-1",
    devices: station.devices.map((d) => ({ ...d, online: false })),
    compartments: station.compartments.map((c) => ({ ...c, fill: 90 })),
  };
  await page.route("**/api/stations", (r) =>
    r.fulfill({ json: [station, other] }),
  );
  await page.route("**/api/buildings", (r) =>
    r.fulfill({
      json: [
        { id: "building-1", name: "Campus" },
        { id: "mall", name: "Mall" },
      ],
    }),
  );
  await page.route("**/api/floors", (r) =>
    r.fulfill({
      json: [
        { id: "floor-1", building_id: "building-1", name: "Campus floor" },
        { id: "mall-1", building_id: "mall", name: "Mall floor" },
      ],
    }),
  );
  await page.goto("/bins");
  const filters = page.getByRole("region", { name: "Bin filters" });
  const choose = async (label: string, option: string) => {
    await filters.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  await expect(filters.getByRole("status")).toHaveText("2 of 2 bins");
  await expect(
    filters.getByRole("combobox", { name: "Floor", exact: true }),
  ).toBeDisabled();
  await choose("Building", "Mall");
  await choose("Floor", "Mall floor");
  await choose("Board connection", "All boards offline");
  await choose("Task", "Collection alerts");
  await filters
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("M11");
  await expect(filters.getByRole("status")).toHaveText("1 of 2 bins");
  await expect(page.locator(".station-card")).toHaveCount(1);
  await choose("Building", "Campus");
  await expect(
    filters.getByRole("combobox", { name: "Floor", exact: true }),
  ).toHaveText("All floors");
  await expect(page.getByText("No bins match these filters.")).toBeVisible();
  await filters.getByRole("button", { name: "Reset filters" }).click();
  await expect(filters.getByRole("status")).toHaveText("2 of 2 bins");
  await choose("Board connection", "All boards online");
  await expect(page.locator(".station-card")).toContainText("Atrium 1");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(filters.getByRole("searchbox")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("records filters and collection form use shared controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const event = {
    id: "complete",
    decision: "recyclable",
    confidence: 0.9,
    provider: "roboflow",
    model: "test",
    raw_label: "Paper",
    reason: null,
    outcome: "completed",
    simulated: false,
    created_at: new Date().toISOString(),
  };
  await page.route("**/api/events?*", (r) =>
    r.fulfill({
      json: [
        event,
        { ...event, id: "pending", decision: "unknown", outcome: null },
      ],
    }),
  );
  let saved: Record<string, string> | undefined;
  await page.route("**/api/collections?*", (r) =>
    r.fulfill({
      json: saved
        ? [
            {
              ...saved,
              id: "collection-1",
              created_at: new Date().toISOString(),
            },
          ]
        : [],
    }),
  );
  await page.route("**/api/stations/s11/collections", async (r) => {
    expect(r.request().method()).toBe("POST");
    saved = r.request().postDataJSON();
    await r.fulfill({ json: { id: "collection-1" } });
  });
  await page.goto("/records?station=s11&view=sorting");
  await page.getByRole("combobox", { name: "Outcome", exact: true }).click();
  await page.getByRole("option", { name: "Not reported", exact: true }).click();
  await expect(page.locator("[data-event-id]")).toHaveCount(1);
  await expect(page.locator('[data-event-id="pending"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.locator("[data-event-id]")).toHaveCount(2);
  await page.getByRole("tab", { name: "Collections", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Record collection", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Compartment", exact: true })
    .click();
  await page.getByRole("option", { name: "E-waste", exact: true }).click();
  await page.getByLabel("Collected by", { exact: true }).fill("  Guard 1  ");
  await page
    .getByLabel("Collection note", { exact: true })
    .fill("  Emptied bin  ");
  await page
    .getByRole("button", { name: "Record collection", exact: true })
    .click();
  await expect(page.getByText("Collection saved.")).toBeVisible();
  expect(saved).toEqual({
    category: "e_waste",
    operator: "Guard 1",
    note: "Emptied bin",
  });
  await page
    .getByRole("searchbox", { name: "Search collections" })
    .fill("guard");
  await expect(page.getByText("1 of 1 recent records")).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search collections" })
    .fill("does not exist");
  await expect(page.getByText("No records match these filters.")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("combobox", { name: "Bin", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("standalone image lab previews, validates and clears image decisions", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/inference/test", async (r) => {
    requests++;
    expect(r.request().method()).toBe("POST");
    expect(r.request().postData()).not.toContain("station_id");
    await r.fulfill({
      json: {
        decision: "e_waste",
        reason: null,
        provider: "mock",
        confidence: 0.94,
        raw_label: "battery",
        model: "scripted-demo-v1",
      },
    });
  });
  await page.goto("/inference?station=does-not-exist");
  await expect(
    page.getByRole("combobox", { name: "Bin", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Sorting activity" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Up to 2 MB/)).toBeVisible();
  const upload = page.getByLabel("JPEG image", { exact: true });
  await upload.setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a JPEG");
  await upload.setInputFiles({
    name: "big.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(2000001),
  });
  await expect(page.getByRole("alert")).toContainText("no more than 2 MB");
  await upload.setInputFiles({
    name: "bad.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  await upload.setInputFiles({
    name: "test.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(page.getByAltText("Selected image preview")).toBeVisible();
  await expect(page.getByText(/16 × 16 px/)).toBeVisible();
  await page
    .getByRole("button", { name: "Classify image", exact: true })
    .click();
  await expect(page.locator(".result")).toContainText("E-waste");
  expect(requests).toBe(1);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".result")).toHaveCount(0);
  await expect(page.getByAltText("Selected image preview")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Classify image", exact: true }),
  ).toBeDisabled();
});
