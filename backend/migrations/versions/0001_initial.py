"""Initial persisted station, telemetry, sorting and collection schema."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "buildings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "floors",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("building_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "stations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("floor_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("x", sa.Double(), nullable=False),
        sa.Column("y", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "collections",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("station_id", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("operator", sa.String(length=100), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_collections_station_id", "collections", ["station_id"])
    op.create_table(
        "compartments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("station_id", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("fill", sa.Double(), nullable=True),
        sa.Column("quality", sa.String(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "devices",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("station_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "sorting_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("station_id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("fingerprint", sa.String(), nullable=False),
        sa.Column("decision", sa.String(), nullable=False),
        sa.Column("confidence", sa.Double(), nullable=True),
        sa.Column("raw_label", sa.String(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("outcome", sa.String(), nullable=True),
        sa.Column("outcome_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("simulated", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"]),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sorting_events_station_id", "sorting_events", ["station_id"])
    op.create_table(
        "telemetry",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("station_id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("fill", sa.Double(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("quality", sa.String(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"]),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_telemetry_station_id", "telemetry", ["station_id"])


def downgrade():
    op.drop_table("telemetry")
    op.drop_table("sorting_events")
    op.drop_table("devices")
    op.drop_table("compartments")
    op.drop_table("collections")
    op.drop_table("stations")
    op.drop_table("floors")
    op.drop_table("messages")
    op.drop_table("buildings")
