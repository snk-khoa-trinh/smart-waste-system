"""Associate separately staged camera images with filming records."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "filming_captures",
        sa.Column("event_id", sa.String(), sa.ForeignKey("sorting_events.id"), primary_key=True),
        sa.Column("arrival_id", sa.String(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("filming_captures")
