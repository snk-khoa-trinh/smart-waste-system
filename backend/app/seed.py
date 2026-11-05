from .db import Building, Compartment, Device, Floor, Session, Station

CATEGORIES = ["recyclable", "non_recyclable", "e_waste"]
# Campus identifiers remain stable for the installed prototype and saved records.
BUILDINGS = [
    ("campus", "Innovation Campus", "floor", "s", [("Atrium 1", "Studio 1"), ("Atrium 2", "Studio 2")]),
    ("mall", "Central Mall", "mall-floor", "m", [("Main Entrance", "Food Court", "Retail Wing"), ("Shopping Area", "Cinema Lobby", "Atrium East"), ("Dining Terrace", "Events Hall")]),
]


def seed(db):
    for building_id, name, floor_prefix, station_prefix, floor_names in BUILDINGS:
        if not db.get(Building, building_id):
            db.add(Building(id=building_id, name=name))
            db.flush()
        for number, station_names in enumerate(floor_names, start=1):
            fid = f"{floor_prefix}-{number}"
            if not db.get(Floor, fid):
                db.add(Floor(id=fid, building_id=building_id, name=f"Level {number:02}"))
                db.flush()
            for position, station_name in enumerate(station_names, start=1):
                sid = f"{station_prefix}{number}{position}"
                if db.get(Station, sid):
                    continue
                db.add(
                    Station(
                        id=sid,
                        floor_id=fid,
                        name=station_name,
                        x=25 if position == 1 else 72,
                        y=(35 if number == 1 else 65) if position <= 2 else (65 if number == 1 else 35),
                    )
                )
                db.flush()
                for category in CATEGORIES:
                    db.add(
                        Compartment(
                            id=f"{sid}:{category}",
                            station_id=sid,
                            category=category,
                            source="simulated",
                            fill=None,
                            quality="missing",
                        )
                    )
                for role, suffix in [("camera_sorter", "cam"), ("fill_monitor", "monitor")]:
                    db.add(Device(id=f"{sid}-{suffix}", station_id=sid, role=role))
    db.commit()


if __name__ == "__main__":
    with Session() as db:
        seed(db)
    print("Seed complete (idempotent; no physical measurements created).")
