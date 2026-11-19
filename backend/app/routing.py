"""Read-only cleaner planning on explicit schematic corridors and floor links.

Costs are estimated seconds, never survey measurements. Exact tours are bounded
at 12 stops; larger tours use deterministic nearest-neighbour + 2-opt.
"""

import heapq
import math
import re
from datetime import timedelta

from sqlalchemy import select

from .config import settings
from .db import Building, Collection, Compartment, Floor, Station, now
from .ingest import utc

BUILDING_IDS = {"campus", "mall", "tower"}
EXACT_LIMIT = 12
WALK_SPEED = 1.1
SERVICE_SECONDS = 30


def natural(value):
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", value)]


class WalkingGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = []
        self.adj = {}

    def node(self, node_id, floor_id, x, y, kind="corridor"):
        self.nodes[node_id] = dict(id=node_id, floor_id=floor_id, x=x, y=y, kind=kind)
        self.adj.setdefault(node_id, [])
        return node_id

    def edge(self, a, b, scale, kind="walk"):
        if any(edge["a"] == a and edge["b"] == b or edge["a"] == b and edge["b"] == a for edge in self.edges):
            return
        start, end = self.nodes[a], self.nodes[b]
        meters = math.hypot(start["x"] - end["x"], start["y"] - end["y"]) * scale
        if kind == "elevator":
            meters, seconds = 0, 20  # Per-floor travel/door allowance; not a live lift prediction.
        elif kind == "stairs":
            meters, seconds = 18, 32
        else:
            seconds = meters / WALK_SPEED
        item = dict(a=a, b=b, kind=kind, meters=meters, seconds=seconds)
        self.edges.append(item)
        self.adj[a].append((b, seconds, meters, kind))
        self.adj[b].append((a, seconds, meters, kind))

    def shortest(self, start):
        distances, previous = {start: 0.0}, {}
        queue = [(0.0, start)]
        while queue:
            cost, node = heapq.heappop(queue)
            if cost > distances[node]:
                continue
            for target, seconds, meters, kind in self.adj[node]:
                updated = cost + seconds
                if updated + 1e-9 < distances.get(target, math.inf):
                    distances[target] = updated
                    previous[target] = (node, meters, kind)
                    heapq.heappush(queue, (updated, target))
        return distances, previous


def walking_graph(floors, stations, building_id, travel_mode):
    graph, mapped = WalkingGraph(), {}
    scale = 2.0 if building_id == "tower" else 1.0
    for floor in floors:
        fid = floor.id

        def point(x, y, kind="corridor", suffix=None):
            return graph.node(f"{fid}:{suffix or f'{x:g},{y:g}'}", fid, x, y, kind)

        def link(a, b):
            graph.edge(a, b, scale)

        lift = point(50, 60 if building_id == "tower" else 61, "elevator", "elevator")
        stairs = point(50, 20 if building_id == "tower" else 24, "stairs", "stairs")
        if building_id == "tower":
            xs, ys = [20, 40, 50, 60, 80], [26, 46, 66]
            for y in ys:
                for x in xs:
                    point(x, y)
                for a, b in zip(xs, xs[1:]):
                    link(point(a, y), point(b, y))
            for x in xs:
                for a, b in zip(ys, ys[1:]):
                    if not (x == 50 and a == 46):
                        link(point(x, a), point(x, b))
            link(lift, point(50, 46))
            link(lift, point(50, 66))
            link(stairs, point(50, 26))
            for station in stations:
                if station.floor_id == fid and station.x in [20, 40, 60, 80] and station.y in ys:
                    mapped[station.id] = point(station.x, station.y)
            entry_link = point(50, 66)
        else:
            # Door links from each room to side corridors, avoiding the mall atrium.
            for x in [42.5, 57.5]:
                for y in [34, 35, 50, 65, 73]:
                    point(x, y)
                for a, b in zip([34, 35, 50, 65], [35, 50, 65, 73]):
                    link(point(x, a), point(x, b))
            for y in [34, 50, 73]:
                link(point(42.5, y), point(50, y))
                link(point(50, y), point(57.5, y))
            link(stairs, point(50, 34))
            link(lift, point(50, 50))
            for station in stations:
                if station.floor_id != fid or station.x not in [25, 72] or station.y not in [35, 65]:
                    continue
                side = 42.5 if station.x == 25 else 57.5
                node = point(station.x, station.y, "bin", station.id)
                link(node, point(side, station.y))
                mapped[station.id] = node
            entry_link = point(50, 73)
        if floor.id == floors[0].id:
            entrance = point(50, 73, "entrance", "entrance")
            link(entrance, entry_link)
    for lower, upper in zip(floors, floors[1:]):
        kind = "elevator" if travel_mode == "elevator" else "stairs"
        graph.edge(f"{lower.id}:{kind}", f"{upper.id}:{kind}", scale, kind)
    return graph, mapped, f"{floors[0].id}:entrance"


def tour_cost(order, matrix):
    return sum(matrix[a][b] for a, b in zip(order, order[1:]))


def exact_tour(matrix):
    count = len(matrix) - 1
    if not count:
        return [0, 0]
    costs, parent = {}, {}
    for i in range(count):
        costs[1 << i, i] = matrix[0][i + 1]
        parent[1 << i, i] = None
    for mask in range(1, 1 << count):
        for last in range(count):
            if (mask, last) not in costs:
                continue
            for target in range(count):
                if mask & (1 << target):
                    continue
                key = (mask | (1 << target), target)
                cost = costs[mask, last] + matrix[last + 1][target + 1]
                if cost < costs.get(key, math.inf):
                    costs[key], parent[key] = cost, last
    mask = (1 << count) - 1
    last = min(range(count), key=lambda i: costs[mask, i] + matrix[i + 1][0])
    reverse = []
    while last is not None:
        reverse.append(last + 1)
        previous = parent[mask, last]
        mask ^= 1 << last
        last = previous
    return [0, *reversed(reverse), 0]


def two_opt(order, matrix):
    order = order[:]
    for _ in range(60):
        best_delta, best_pair = -1e-7, None
        for i in range(1, len(order) - 2):
            for j in range(i + 1, len(order) - 1):
                a, b, c, d = order[i - 1], order[i], order[j], order[j + 1]
                delta = matrix[a][c] + matrix[b][d] - matrix[a][b] - matrix[c][d]
                if delta < best_delta:
                    best_delta, best_pair = delta, (i, j)
        if best_pair is None:
            break
        i, j = best_pair
        order[i : j + 1] = reversed(order[i : j + 1])
    return order


def optimized_tour(matrix):
    count = len(matrix) - 1
    if count <= EXACT_LIMIT:
        return exact_tour(matrix), "exact", True
    baseline = [0, *range(1, count + 1), 0]
    candidates = [two_opt(baseline, matrix)]
    for first in sorted(range(1, count + 1), key=lambda node: (matrix[0][node], node))[:8]:
        remaining = set(range(1, count + 1)) - {first}
        order = [0, first]
        while remaining:
            target = min(remaining, key=lambda node: (matrix[order[-1]][node], node))
            order.append(target)
            remaining.remove(target)
        candidates.append(two_opt([*order, 0], matrix))
    return min(candidates, key=lambda order: tour_cost(order, matrix)), "nearest-neighbour + 2-opt", False


def demo_fill(station_index, category_index):
    # Request-only repeatable scenario, not persisted telemetry or a device heartbeat.
    return [(24, 38, 46), (88, 72, 55), (42, 61, 35), (65, 96, 78), (70, 48, 62), (81, 60, 92)][station_index % 6][category_index]


def plan_collection(db, request):
    building = db.get(Building, request.building_id)
    if not building:
        raise ValueError("Building not found; apply the location seed first")
    floors = sorted(db.scalars(select(Floor).where(Floor.building_id == building.id)), key=lambda f: natural(f.id))
    if not floors or len(floors) > 24:
        raise ValueError("Building needs between 1 and 24 mapped floors")
    floor_ids = {floor.id for floor in floors}
    stations = sorted(
        (station for station in db.scalars(select(Station)) if station.floor_id in floor_ids),
        key=lambda station: (natural(station.floor_id), natural(station.id)),
    )
    if len(stations) > 200:
        raise ValueError("This prototype planner supports at most 200 bins per building")
    graph, mapped, entrance = walking_graph(floors, stations, building.id, request.travel_mode)
    origin = request.start_node_id or entrance
    if origin not in graph.nodes or graph.nodes[origin]["kind"] not in {"entrance", "elevator", "stairs"}:
        raise ValueError("Choose a mapped entrance, elevator or stair landing as the start for this building")
    snapshot = now()
    compartments = list(db.scalars(select(Compartment).where(Compartment.station_id.in_([s.id for s in stations]))))
    collections = list(db.scalars(select(Collection).where(Collection.station_id.in_([s.id for s in stations]))))
    collected_at = {}
    for record in collections:
        key = record.station_id, record.category
        stamp = utc(record.created_at)
        collected_at[key] = max(collected_at.get(key, stamp), stamp)
    stops, excluded = [], []
    all_values = {}
    for index, station in enumerate(stations):
        rows = [row for row in compartments if row.station_id == station.id]
        required = []
        if request.source == "demo":
            values = [
                {"category": category, "fill": demo_fill(index, c), "source": "simulated"}
                for c, category in enumerate(["recyclable", "non_recyclable", "e_waste"])
            ]
            required = [row for row in values if row["fill"] >= request.threshold]
        else:
            values = []
            for row in rows:
                stamp = utc(row.measured_at) if row.measured_at else None
                eligible = (
                    row.source == "sensor"
                    and row.quality == "valid"
                    and row.fill is not None
                    and math.isfinite(row.fill)
                    and 0 <= row.fill <= 100
                    and stamp is not None
                    and timedelta(0) <= snapshot - stamp <= timedelta(seconds=settings.heartbeat_expiry)
                    and collected_at.get((station.id, row.category), stamp - timedelta(seconds=1)) < stamp
                )
                if eligible:
                    values.append(dict(category=row.category, fill=row.fill, source="sensor"))
            required = [row for row in values if row["fill"] >= request.threshold]
        all_values[station.id] = values
        if not required:
            excluded.append(
                dict(
                    id=station.id,
                    name=station.name,
                    reason="No fresh, uncollected sensor reading at threshold"
                    if request.source == "live"
                    else "Below demo threshold",
                )
            )
        elif station.id not in mapped:
            excluded.append(dict(id=station.id, name=station.name, reason="Bin has no configured walkable access link"))
        else:
            stops.append(
                dict(
                    id=station.id,
                    name=station.name,
                    floor_id=station.floor_id,
                    x=station.x,
                    y=station.y,
                    compartments=required,
                )
            )
    distances, previous = {}, {}
    origin_distances, _ = graph.shortest(origin)
    reachable = []
    for stop in stops:
        if mapped[stop["id"]] not in origin_distances:
            excluded.append(dict(id=stop["id"], name=stop["name"], reason="No reachable path from start"))
        else:
            reachable.append(stop)
    stops = reachable
    targets = [origin, *[mapped[stop["id"]] for stop in stops]]
    for target in set(targets):
        distances[target], previous[target] = graph.shortest(target)
    matrix = [[distances[a][b] for b in targets] for a in targets]
    baseline = [0, *range(1, len(targets)), 0]
    order, algorithm, optimal = optimized_tour(matrix)
    baseline_seconds = tour_cost(baseline, matrix)
    travel_seconds = tour_cost(order, matrix)

    def describe_legs(sequence):
        legs, walking_meters = [], 0.0
        for leg_number, (a, b) in enumerate(zip(sequence, sequence[1:])):
            start, end = targets[a], targets[b]
            path, meters = [end], 0
            while path[-1] != start:
                node, distance, _kind = previous[start][path[-1]]
                meters += distance
                path.append(node)
            path.reverse()
            walking_meters += meters
            legs.append(
                dict(
                    index=leg_number + 1,
                    from_id=stops[a - 1]["id"] if a else "start",
                    to_id=stops[b - 1]["id"] if b else "start",
                    seconds=round(matrix[a][b], 2),
                    points=[graph.nodes[node] for node in path],
                )
            )
        return legs, walking_meters

    legs, walking_meters = describe_legs(order)
    baseline_legs, baseline_meters = describe_legs(baseline)
    return dict(
        building=dict(id=building.id, name=building.name),
        source=request.source,
        threshold=request.threshold,
        travel_mode=request.travel_mode,
        generated_at=snapshot,
        layout_version="schematic-v1",
        estimated=True,
        start_node_id=origin,
        floors=[dict(id=f.id, building_id=f.building_id, name=f.name) for f in floors],
        nodes=list(graph.nodes.values()),
        edges=graph.edges,
        start_options=[node for node in graph.nodes.values() if node["kind"] in {"entrance", "elevator", "stairs"}],
        bins=[dict(id=s.id, name=s.name, floor_id=s.floor_id, x=s.x, y=s.y, values=all_values[s.id]) for s in stations],
        stops=[dict(stop, order=i + 1) for i, stop in enumerate(stops[index - 1] for index in order[1:-1])],
        excluded=excluded,
        legs=legs,
        baseline_legs=baseline_legs,
        algorithm=algorithm,
        optimal_for_modeled_graph=optimal,
        summary=dict(
            total_bins=len(stations),
            stops=len(stops),
            walking_meters=round(walking_meters, 1),
            travel_seconds=round(travel_seconds, 1),
            service_seconds=len(stops) * SERVICE_SECONDS,
            total_seconds=round(travel_seconds + len(stops) * SERVICE_SECONDS, 1),
            baseline_travel_seconds=round(baseline_seconds, 1),
            baseline_walking_meters=round(baseline_meters, 1),
            saved_travel_seconds=round(max(0, baseline_seconds - travel_seconds), 1),
            saved_percent=round(100 * max(0, baseline_seconds - travel_seconds) / baseline_seconds, 1)
            if baseline_seconds
            else 0,
        ),
        baseline_order=[stop["id"] for stop in stops],
        assumptions=[
            "Schematic corridor/door connections; distances are not surveyed.",
            "Walk speed 1.1 m/s; 30 seconds service per bin.",
            "Lift: 20 seconds per floor including door allowance; stairs: 32 seconds per floor.",
            "One cleaner, no cart capacity, live lift waits, blocked-corridor feed or time windows.",
            "Returns to start. Baseline visits the SAME selected bins in floor/bin ID order.",
        ],
    )
