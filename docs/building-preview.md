# Building previews

The overview offers a 2D floor plan and a 3D cutaway for each configured building. The campus seed has two floors and four bins; the mall has three floors and eight bins. Riverside Complex adds eight floors and96 bins with corridor-side positions and four wings per floor. Existing campus and hardware IDs remain unchanged; new placeholders do not invent sensor measurements.

The building preview is the overview's main workspace. Its two toolbar rows combine the building selector and 2D/3D tabs, then floor selection and camera controls. There is no separate overview bin-card list or repeated location filter. In 2D, the floor selector shows one floor at a time. In 3D it can show every level or isolate a floor.

Collection alerts and Needs checking sit over both views. Their counts apply to the building and floor(s) currently visible. Toggling a filter dims non-matching bins while leaving the complete building in view; toggling it again clears the filter. Demo-only data is excluded from the counts. Small marker accents indicate bins needing collection or checking, and an info tooltip explains the data rules.

Clicking a bin or its projected label opens a shadcn popover anchored to that marker, with sensor/demo readings, stale/missing status, board connectivity and an Open bin link to its dedicated page. Keyboard selection, Escape dismissal and mobile collision handling are supported.

Drag to rotate the 3D model; scroll or pinch to zoom. Compact zoom, reset and floor-separation buttons share the second toolbar row. Help text lives in a tooltip; there are no permanent instruction or feature-caption strips. Both modes share bin coordinates, selection and alert semantics.

## Models and coordinates

These are procedural schematic models, not surveyed building geometry. No third-party model files, remote textures or font downloads are required. `frontend/src/components/building-preview/layout.ts` contains shared room, elevator, stair and entrance geometry, plus the conversion of backend bin x/y coordinates into 3D coordinates. `floor-plan.tsx` draws the SVG floor plan. `three-view.tsx` builds slabs, walls, windows, stairs, elevator cabins, entrance frames and lidded bin models from Three.js primitives. The mall's upper floors include an atrium opening.

The view uses Three.js, React Three Fiber 9 and Drei's orbit controls, edge rendering and mesh outlines. Shadcn Tabs, Select, Button and Tooltip provide the controls; the spatial SVG/canvas is custom because these UI primitives do not provide a building viewer. Labels are projected onto a DOM overlay owned by the existing React tree, avoiding separate React roots during model teardown.

The 3D module loads only when selected. It renders on demand and caps pixel ratio at 1.5. Unsupported WebGL, renderer errors or a lost graphics context offer a return to the 2D plan. Viewing and selecting bins never triggers inference or motor commands.

## Validation

`e2e/building-preview.spec.ts` uses fixture API responses and software WebGL to check two-building floor selection, matching 2D/3D bin selection, hover state, rendered canvas changes after zoom, camera gestures, floor separation, floor isolation, mobile touch and the 2D fallback. Run it against the Vite development server:

```sh
DASHBOARD_URL=http://127.0.0.1:5174 CHROMIUM_PATH=/usr/local/bin/chromium \
  nub --cwd frontend exec playwright test e2e/building-preview.spec.ts
```

Apply updated location identities to an existing installation with `sudo ./scripts/seed-locations.sh`. Rebuild the frontend container after installing the 3D dependencies. No backend restart or firmware change is required for viewing these layouts.

## Large-building routing

Riverside uses a different four-wing schematic, matching the route planner's
corridor grid and core locations. Elevator/stair geometry comes from
`buildingFeatures` for both SVG and 3D; camera distance bounds scale to show all
eight floors. `/routes` adds numbered itineraries and actual walk-graph segments
to the same floor plan. See [routing guide](collection-routing.md). The third
building is a designed demonstration, not a surveyed or instrumented site.

When more than four floors are shown in3D, bin labels appear only for the
selected/hovered bin to avoid covering the model with96 overlapping labels.
Floor labels remain visible; isolating a floor restores all its bin labels.
The individual3D bin meshes remain selectable in either mode.

The collection-route map additionally uses theme-aware blue/teal/amber route
roles and direction chevrons. Its default isolates the selected approach with
other paths faded; All legs shows the circuit. SVG markers compose the shared
shadcn Tooltip/Popover primitives for hover/focus and pinned click/tap fill
summaries. Overview markers retain their existing bin-detail behavior.
