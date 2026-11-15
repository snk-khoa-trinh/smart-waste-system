# Cleaner collection routes

SWS uses IoT fill readings to decide **which bins need collection**, then plans
an efficient walking circuit for one cleaner within one building. The planner is
read-only: it does not move motors, call Roboflow, change readings, or mark bins
collected. [API contract](api.md) · [architecture](architecture.md)

## Buildings and setup

| Building | Floors | Bins | Purpose |
| --- | --- | --- | --- |
| Innovation Campus | 2 | 4 | Existing small layout and physical S11 prototype |
| Central Mall | 3 | 8 | Existing atrium and multi-floor demonstration |
| Riverside Complex | 8 | 96 | Large schematic with 12 corridor-side bins per floor |

The normal seed now creates 108 bins across 13 floors. The separate optional
filming-demo bin is additional. Seed operations add identities and layout only:
no physical/synthetic fill values or online heartbeats are invented. Existing
station IDs, measurements, events and collections are preserved.

On the existing hardware deployment, run from the repository root:

```sh
sudo ./scripts/update-inference-api.sh
sudo docker compose start frontend
```

The first command builds the API and matching initializer, starts the existing
database, then runs additive migrations/location seeding and starts the API. The
second starts the existing frontend container. Neither arms boards or calls
inference. Rebuilding the named initializer avoids an older image failing to
recognize a newer database migration during ordinary Compose starts. Frontend development mode reloads the new route page;
production builds require a frontend rebuild using the deployment's existing
Compose overlays. No firmware change is needed for routing.

Open `/routes` or **Collection route** in the sidebar. Select Riverside Complex
and **Demo fill scenario** to demonstrate the 96-bin layout immediately, even
when only the existing S11 hardware is installed.

## Selecting work from readings

Live mode considers each compartment independently:

- Source must be `sensor`, quality `valid`, fill finite and within0–100.
- Timestamp must not be in the future or older than `HEARTBEAT_EXPIRY` seconds
  (default90, shared with the backend's freshness policy).
- Fill must meet the chosen threshold (default80%, adjustable1–100 through API).
- A collection record at/after that measurement suppresses the reading until a
  new qualifying reading arrives. Recording collection never fabricates a0% reset.

All eligible compartments at a bin become **one collection stop**. Camera
connectivity does not erase a recent valid fill reading. Missing/stale values are
not treated as empty; they are excluded and need checking in the normal dashboard.
Bins with no configured access link or no reachable path are explicitly skipped.

**Demo fill scenario** generates deterministic request-only synthetic percentages
for the selected building. It writes no readings, collection records, status or
heartbeats to SQL/MQTT. It does not reuse the physical measurements or falsely
make the building online. The UI and exported plan identify source=`demo`.

## Walkable model and travel assumptions

`backend/app/routing.py` defines explicit corridor junctions, room-door access
links, entrances, elevator landings and stairs. It never connects arbitrary bins
by a straight line through walls. Campus/mall links detour around the atrium;
Riverside uses a corridor grid around four wings per floor. Its core dimensions
are shared with the 2D/3D model. Unknown/unmapped bin coordinates are skipped,
not silently snapped through obstacles.

These are **schematics**, not surveyed building plans. Coordinates are normalized
for rendering. The model assumes1m per coordinate unit on campus/mall and2m at
Riverside: its76×58-unit footprint represents approximately152×116m per floor.
Riverside has eight levels, grid rows26/46/66 and corridor columns20/40/50/60/80.
Twelve bins per floor occupy the four outer/inner corridor columns. The elevator
is at50,60 and stairs at50,20. Room rectangles must remain outside these paths.

Travel cost is estimated time, with:

- Walking speed1.1m/s on horizontal links.
- Elevator-only or stairs-only connections between adjacent levels, selected by
  the operator. Elevator allowance20s per floor; stair allowance32s and18m walking.
- Fixed30s service time per bin, shown separately from travel.
- Entrance start/finish by default; any mapped stair/elevator landing may instead
  be selected. The plan always returns to that same start.

Elevator figures are a fixed per-floor allowance, not live arrival/wait predictions.
No crowding, door access feeds, blocked lifts/corridors, cart capacity, multiple
cleaners, shift limits or time windows are modeled. This is a single-building
planner; no outdoor connections between the three sites are invented.

## Algorithm and comparison

1. Select eligible stops from one reading snapshot.
2. Run Dijkstra shortest paths on the permitted corridor/floor graph to create a
   pairwise travel-time matrix.
3. For up to12 stops, use Held–Karp dynamic programming for an **exact minimum
   round trip on this modeled graph**.
4. Above12 stops, improve deterministic nearest-neighbour starts and the baseline
   with bounded2-opt, then keep the cheapest result.
5. Expand each ordered leg back to its actual graph points for floor maps.

Large tours are labelled **heuristic**, never globally optimal. The large result
is no worse than the comparison baseline because that baseline is included as a
candidate. As [Google's routing documentation](https://developers.google.com/optimization/routing/tsp)
explains, routing solvers do not in general guarantee the best possible large tour.
There is no OR-Tools dependency or external routing API in this implementation.

The baseline visits the **same selected bins** in floor/bin-ID order and returns
to the same start, using the same shortest paths/profile. The percentage saved
compares modeled travel time, not a measured cleaner shift or an intentionally
longer all-bins inspection. Collection service time is constant for both orders.

The example Riverside scenario at80% selects48 bins (each once) and leaves48
below threshold. Actual savings depend on the chosen start/profile/threshold;
show the value calculated on screen rather than hardcoding a promotional number.

## Using the page

1. Select building, live/demo source, threshold, travel profile and start/finish.
2. The page calculates a snapshot; **Recalculate** refreshes it from current data.
3. Compare estimated ID-order travel, planned travel, walking distance and savings.
4. Toggle **Planned / ID order** to compare path and stop numbering on each floor.
5. Select a floor or a stop. **Selected leg** isolates its blue approach with
   direction chevrons; the heading names the previous/next stop and any floor
   connection. **All legs** shows other legs in teal and the return in amber.
   Numbers identify stops; colors identify route roles, not waste categories.
6. Hover/focus a bin for its three fill percentages; click/tap to pin the same
   summary. Demo percentages are explicitly synthetic. Live previews use current
   station readings (including marked stale/invalid/missing values), independently
   of the route snapshot; refresh failures are labelled cached.
7. **Next stop** follows the itinerary across floors. After the final stop,
   **Return to start** highlights the last leg and moves the map to the start floor.
8. Open the bin detail if required. **Export** downloads JSON with graph, paths,
   source, assumptions, skipped bins and calculation timestamp.
9. Record actual work in Records → Collections. Recalculate after new readings.

Map lines break at floor transitions; they never draw a diagonal between floors.
The SVG route overlay is project-specific, composed with the existing floor plan
and shadcn Select, Tabs, Button and tooltip primitives. A generic UI component
cannot supply building graph geometry or route numbering.

## Validation

Backend regressions compare small exact tours with brute force, verify heuristic
cost against the same-stop baseline, check walkable edge expansion and obstacle
avoidance, test live freshness/collection/source rules and prove demo mode writes
no telemetry/events. Seed checks preserve existing measurements and counts.
Frontend checks cover separating path segments by floor plus browser navigation,
96-bin layout, source/profile/threshold controls, comparison and mobile overflow.
All validation uses isolated fixtures; physical walking distances and cleaner
service times still need an on-site survey and timed trial.

## Filming add-on

Existing hardware footage remains useful. Add only the route-planning screen
clip described in [filming handoff](filming-handoff.md): show the large building,
explicit demo source,48 collection stops, ID-order/planned comparison, floor links
and Next stop. Caption it **“IoT-driven collection planning · synthetic scenario ·
estimated route”**. Do not claim the heuristic is a proven global optimum or that
this model represents an already instrumented96-bin building.
