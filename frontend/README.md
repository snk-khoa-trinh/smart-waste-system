# Frontend

Vite/React dashboard for collection staff: a 2D/3D building overview, bin directory,
bin detail pages, sorting/collection records and a standalone image classifier lab.
TanStack Router handles routes; Query fetches backend state. shadcn/ui and Tailwind
provide the shared component/theme baseline. Three.js/R3F/Drei load for 3D preview.

[Repository guide](../README.md) · [UI agent rules](AGENTS.md) · [Building preview](../docs/building-preview.md)

## Run and check

Use Nub 0.9.0 (not Bun). Commands run from the repository root:

```sh
nub --cwd frontend ci
nub --cwd frontend run dev
nub --cwd frontend run lint
nub --cwd frontend run test
nub --cwd frontend run build
```

Vite proxies `/api` to the backend configured by `API_URL` (default localhost8000).
The root guide has the Compose development command. Production serves `dist/`
through Nginx, including direct-route fallback. No provider/device secret belongs
in browser code or `VITE_*` variables.

## Routes and source

- `/`: building/floor workspace, attention overlays and bin popovers.
- `/bins`, `/bins/:stationId`: filters, readings, connectivity and history.
- `/routes`: cleaner collection route, live/demo priorities, same-stop comparison and floor itinerary.
- `/records`: Sorting and Collections tabs; optional `station` query parameter.
- `/inference`: independent JPEG preview and classifier test; no bin selector.
- `src/components/ui/`: shared shadcn primitives and variants.
- `src/lib/`: query and attention/data helpers.
- `src/components/building-preview/`: shared geometry, SVG plan and lazy 3D viewer.

```sh
DASHBOARD_URL=http://127.0.0.1:5173 nub --cwd frontend exec playwright test e2e/navigation.spec.ts e2e/building-preview.spec.ts
```

Those browser tests mock API requests. `e2e/dashboard.spec.ts` performs mutations
and classification: run it only against an isolated mock-provider demo stack.
Use `CHROMIUM_PATH` if a system browser executable is required. Never use the live
hardware/Roboflow stack for generic browser rendering checks.

For filming only, `/bins/filming-demo` and its telemetry poll every500ms to show
one-second synthetic fill steps. Other query paths retain the normal five-second
interval. The synthetic label, timestamps and stale semantics remain visible;
there is no client-side fabrication/interpolation of sensor values.

Building previews also support Riverside Complex (8 floors/96 corridor bins) with
matching 2D/3D wing/core geometry. Route maps reuse the floor plan, with API graph
paths rather than straight lines between bins. See [collection routing](../docs/collection-routing.md)
for eligibility, modeled cost assumptions, source labels and filming steps.

Route visibility uses a selected blue approach with direction chevrons, plus an
optional teal/amber full circuit. Bin hover/focus shows fill levels; click/tap pins
them. The live preview reads the station API with quality/freshness labels rather
than treating the route snapshot as current sensor data. Dedicated UI regressions
are in `e2e/collection-route.spec.ts`; all API responses there are isolated fixtures.
