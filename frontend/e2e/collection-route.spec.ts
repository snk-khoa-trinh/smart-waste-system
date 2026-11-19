import { expect, test } from "@playwright/test";

const floors = [1, 2].map((level) => ({
  id: `tower-floor-${level}`,
  building_id: "tower",
  name: `Level 0${level}`,
}));
const node = (
  id: string,
  level: number,
  x: number,
  y: number,
  kind = "corridor",
) => ({ id, floor_id: `tower-floor-${level}`, x, y, kind });
const start = node("start", 1, 50, 73, "entrance"),
  a = node("a", 1, 50, 66),
  b = node("b", 1, 80, 66),
  c = node("c", 1, 80, 26);
const d = node("d", 1, 50, 26),
  e = node("e", 1, 50, 60, "elevator"),
  f = node("f", 2, 50, 60, "elevator"),
  g = node("g", 2, 50, 26),
  h = node("h", 2, 60, 26);
const nodes = [start, a, b, c, d, e, f, g, h];
const values = [
  { category: "recyclable", fill: 88, source: "simulated" },
  { category: "non_recyclable", fill: 72, source: "simulated" },
  { category: "e_waste", fill: 55, source: "simulated" },
];
const bins = [
  {
    id: "t0102",
    name: "Northeast collection point",
    floor_id: floors[0].id,
    x: 80,
    y: 26,
    values,
  },
  {
    id: "t0204",
    name: "East wing",
    floor_id: floors[1].id,
    x: 60,
    y: 26,
    values,
  },
];
const legs = [
  {
    index: 1,
    from_id: "start",
    to_id: "t0102",
    seconds: 100,
    points: [start, a, b, c],
  },
  {
    index: 2,
    from_id: "t0102",
    to_id: "t0204",
    seconds: 100,
    points: [c, d, e, f, g, h],
  },
  {
    index: 3,
    from_id: "t0204",
    to_id: "start",
    seconds: 120,
    points: [h, g, f, e, a, start],
  },
];
function plan(source: string) {
  return {
    building: { id: "tower", name: "Riverside Complex" },
    source,
    generated_at: new Date().toISOString(),
    threshold: 80,
    travel_mode: "elevator",
    start_node_id: "start",
    floors,
    nodes,
    edges: legs.flatMap((leg) =>
      leg.points
        .slice(1)
        .map((to, i) => ({
          a: leg.points[i].id,
          b: to.id,
          kind: leg.points[i].floor_id === to.floor_id ? "walk" : "elevator",
          seconds: 20,
          meters: 10,
        })),
    ),
    start_options: [start, e, f],
    bins,
    stops:
      source === "demo"
        ? bins.map((bin, i) => ({
            ...bin,
            order: i + 1,
            compartments: [values[0]],
          }))
        : [],
    excluded: [],
    legs: source === "demo" ? legs : [],
    baseline_legs: source === "demo" ? legs : [],
    baseline_order: source === "demo" ? bins.map((bin) => bin.id) : [],
    algorithm: "exact",
    optimal_for_modeled_graph: true,
    assumptions: ["Test schematic"],
    summary: {
      total_bins: 2,
      stops: source === "demo" ? 2 : 0,
      walking_meters: 200,
      travel_seconds: 320,
      service_seconds: 60,
      total_seconds: 380,
      baseline_travel_seconds: 360,
      baseline_walking_meters: 240,
      saved_travel_seconds: 40,
      saved_percent: 11.1,
    },
  };
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/routes/plan") {
      expect(route.request().method()).toBe("POST");
      return route.fulfill({
        json: plan(route.request().postDataJSON().source),
      });
    }
    expect(route.request().method()).toBe("GET");
    const json =
      path === "/api/buildings"
        ? [{ id: "tower", name: "Riverside Complex" }]
        : path === "/api/ready"
          ? { status: "ready" }
          : path === "/api/stations"
            ? bins.map((bin) => ({
                ...bin,
                devices: [],
                compartments: [
                  {
                    category: "recyclable",
                    fill: 88,
                    source: "sensor",
                    quality: "valid",
                    stale: true,
                    measured_at: "2020-01-01T00:00:00Z",
                  },
                  {
                    category: "e_waste",
                    fill: null,
                    source: "sensor",
                    quality: "invalid",
                    stale: false,
                    measured_at: null,
                  },
                ],
              }))
            : [];
    return route.fulfill({ json });
  });
});

test("arrows, click/keyboard fill details, floor transition and return leg", async ({
  page,
}) => {
  await page.goto("/routes");
  const marker = page.locator('[data-bin-id="t0102"]');
  await marker.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const details = page.getByRole("dialog", {
    name: "Fill levels T0102",
    exact: true,
  });
  await expect(details).not.toBeVisible();
  await marker.click();
  await expect(details).toContainText("88%");
  await expect(details).toContainText("stale");
  await expect(details).toContainText("Invalid");
  await expect(details).toContainText("Missing");
  await marker.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(details).not.toBeVisible();
  await page.getByRole("combobox", { name: "Readings", exact: true }).click();
  await page
    .getByRole("option", { name: "Demo fill scenario", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Selected leg", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator('[data-active-leg="true"] [data-route-arrow]'),
  ).not.toHaveCount(0);
  await marker.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(details).toBeVisible();
  await expect(details).toContainText("Synthetic route scenario");
  await expect(details).toContainText("72%");
  await page.keyboard.press("Escape");
  await expect(details).not.toBeVisible();
  await page.getByRole("button", { name: "Next stop", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Route floor", exact: true }),
  ).toContainText("Level 02");
  await expect(
    page.getByRole("status", { name: "Selected route leg" }),
  ).toContainText("Level 01 → Level 02");
  await page
    .getByRole("button", { name: "Return to start", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Selected route leg" }),
  ).toContainText("Start / finish");
  await expect(
    page.locator('[data-active-leg="true"] line[stroke="var(--route-return)"]'),
  ).not.toHaveCount(0);
  await page.getByRole("tab", { name: "All legs", exact: true }).click();
  await expect(
    page.locator('[data-active-leg="false"] [data-route-arrow]'),
  ).not.toHaveCount(0);
});

test.describe("touch fill details", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    colorScheme: "dark",
  });
  test("tap pins percentages within the viewport", async ({ page }) => {
    await page.goto("/routes");
    await page.getByRole("combobox", { name: "Readings", exact: true }).click();
    await page
      .getByRole("option", { name: "Demo fill scenario", exact: true })
      .click();
    await page.locator('[data-bin-id="t0102"]').tap();
    const details = page.getByRole("dialog", {
      name: "Fill levels T0102",
      exact: true,
    });
    await expect(details).toBeVisible();
    await expect(details).toContainText("88%");
    const box = await details.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
