"""Planner correctness uses isolated SQLite and schematic paths, never hardware."""

import itertools
import math
from datetime import timedelta

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.contracts import RoutePlanInput
from app.db import Base, Collection, Compartment, Floor, SortingEvent, Station, Telemetry, now
from app.routing import exact_tour, optimized_tour, plan_collection, tour_cost, walking_graph
from app.seed import seed


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with sessionmaker(engine, expire_on_commit=False)() as session:
        seed(session)
        yield session
    engine.dispose()


def reading(db, sid, category="recyclable", **changes):
    row = db.get(Compartment, f"{sid}:{category}")
    for key, value in (dict(source="sensor", quality="valid", fill=90, measured_at=now()) | changes).items():
        setattr(row, key, value)
    db.commit()
    return row


def test_exact_matches_brute_force():
    points = [(0, 0), (4, 1), (1, 7), (8, 4), (3, 3), (9, 9), (8, 0)]
    matrix = [[math.dist(a, b) for b in points] for a in points]
    best = min(tour_cost([0, *order, 0], matrix) for order in itertools.permutations(range(1, len(points))))
    result = exact_tour(matrix)
    assert result[0] == result[-1] == 0
    assert sorted(result[1:-1]) == list(range(1, len(points)))
    assert tour_cost(result, matrix) == pytest.approx(best)
    assert exact_tour([[0]]) == [0, 0]


def test_large_heuristic_never_worse_than_same_stop_baseline():
    points = [(i % 4, (i * 7) % 13) for i in range(30)]
    matrix = [[math.dist(a, b) for b in points] for a in points]
    order, algorithm, optimal = optimized_tour(matrix)
    assert not optimal and "2-opt" in algorithm
    assert sorted(order[1:-1]) == list(range(1, len(points)))
    assert tour_cost(order, matrix) <= tour_cost([0, *range(1, len(points)), 0], matrix) + 1e-7


def test_live_eligibility_collection_and_one_stop_per_bin(db):
    row = reading(db, "s11")
    reading(db, "s11", "e_waste")
    reading(db, "s12", measured_at=now() - timedelta(minutes=10))
    reading(db, "s21", source="simulated")
    reading(db, "s22", quality="invalid", fill=None)
    plan = plan_collection(db, RoutePlanInput(building_id="campus"))
    assert [stop["id"] for stop in plan["stops"]] == ["s11"]
    assert len(plan["stops"][0]["compartments"]) == 2
    assert plan["optimal_for_modeled_graph"] is True
    for category in ["recyclable", "e_waste"]:
        db.add(Collection(id=category, station_id="s11", category=category, operator="test", note=""))
    db.commit()
    assert not plan_collection(db, RoutePlanInput(building_id="campus"))["stops"]
    db.refresh(row)
    assert row.fill == 90  # Planning/collection never fabricates a reset reading.


def test_demo_scale_paths_and_no_database_writes(db):
    before = [(c.id, c.fill, c.source, c.measured_at) for c in db.scalars(select(Compartment))]
    result = plan_collection(db, RoutePlanInput(building_id="tower", source="demo"))
    assert result["summary"]["total_bins"] == 96
    assert len(result["floors"]) == 8
    assert 12 < len(result["stops"]) < 96
    assert len(plan_collection(db, RoutePlanInput(building_id="tower", source="demo", threshold=90))["stops"]) == 32
    assert not result["optimal_for_modeled_graph"]
    assert result["summary"]["travel_seconds"] <= result["summary"]["baseline_travel_seconds"]
    assert result["summary"]["saved_percent"] > 0
    assert len({stop["id"] for stop in result["stops"]}) == len(result["stops"])
    assert set(result["baseline_order"]) == {stop["id"] for stop in result["stops"]}
    edge_pairs = {frozenset([edge["a"], edge["b"]]) for edge in result["edges"]}
    for leg in [*result["legs"], *result["baseline_legs"]]:
        for a, b in zip(leg["points"], leg["points"][1:]):
            assert frozenset([a["id"], b["id"]]) in edge_pairs
    assert result["legs"][0]["from_id"] == result["legs"][-1]["to_id"] == "start"
    after = [(c.id, c.fill, c.source, c.measured_at) for c in db.scalars(select(Compartment))]
    assert before == after
    assert db.scalar(select(func.count()).select_from(Telemetry)) == 0
    assert db.scalar(select(func.count()).select_from(SortingEvent)) == 0


def test_mall_paths_do_not_cross_atrium_and_floor_links_are_profile_specific(db):
    floors = sorted(db.scalars(select(Floor).where(Floor.building_id == "mall")), key=lambda floor: floor.id)
    stations = list(db.scalars(select(Station)))
    for mode in ["elevator", "stairs"]:
        graph, mapped, start = walking_graph(floors, stations, "mall", mode)
        assert len(mapped) == 8
        assert len(graph.shortest(start)[0]) == len(graph.nodes)
        for edge in graph.edges:
            a, b = graph.nodes[edge["a"]], graph.nodes[edge["b"]]
            if a["floor_id"] != b["floor_id"]:
                assert edge["kind"] == mode
            else:
                for step in range(101):
                    x = a["x"] + (b["x"] - a["x"]) * step / 100
                    y = a["y"] + (b["y"] - a["y"]) * step / 100
                    assert not (43 < x < 57 and 35 < y < 48)


def test_unmapped_bins_and_invalid_start_are_explained(db):
    reading(db, "s11")
    db.get(Station, "s11").x = 1
    db.commit()
    result = plan_collection(db, RoutePlanInput(building_id="campus"))
    assert not result["stops"]
    assert "access link" in next(bin for bin in result["excluded"] if bin["id"] == "s11")["reason"]
    with pytest.raises(ValueError, match="start"):
        plan_collection(db, RoutePlanInput(building_id="campus", start_node_id="mall-floor-1:elevator"))


def test_future_readings_not_selected(db):
    reading(db, "s11", measured_at=now() + timedelta(minutes=1))
    assert not plan_collection(db, RoutePlanInput(building_id="campus"))["stops"]


def test_tower_corridor_links_do_not_cross_room_interiors(db):
    floors = list(db.scalars(select(Floor).where(Floor.building_id == "tower")))
    graph, mapped, _ = walking_graph(floors, list(db.scalars(select(Station))), "tower", "elevator")
    assert len(mapped) == 96
    for edge in graph.edges:
        a, b = graph.nodes[edge["a"]], graph.nodes[edge["b"]]
        if a["floor_id"] != b["floor_id"]:
            continue
        for step in range(101):
            x = a["x"] + (b["x"] - a["x"]) * step / 100
            y = a["y"] + (b["y"] - a["y"]) * step / 100
            assert not any(left < x < left + 16 and top < y < top + 16 for left in [22, 62] for top in [28, 48])
