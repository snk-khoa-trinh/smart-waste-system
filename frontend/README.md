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
