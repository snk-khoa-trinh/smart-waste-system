from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Category = Literal["recyclable", "non_recyclable", "e_waste"]


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1]
    message_id: UUID
    station_id: str
    device_id: str
    measured_at: datetime

    @model_validator(mode="after")
    def utc_time(self):
        if self.measured_at.tzinfo is None:
            raise ValueError("Timezone required")
        self.measured_at = self.measured_at.astimezone(UTC)
        if self.measured_at > datetime.now(UTC) + timedelta(seconds=30):
            raise ValueError("Timestamp too far in future")
        return self


class Fill(Envelope):
    category: Category
    fill_percentage: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    source: Literal["sensor", "simulated"]
    quality: Literal["valid", "invalid", "missing"]

    @model_validator(mode="after")
    def reading(self):
        if (self.quality == "valid") != (self.fill_percentage is not None):
            raise ValueError("Valid readings require a value; invalid/missing readings require null")
        return self


class Heartbeat(Envelope):
    status: Literal["online", "offline"]


class Outcome(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    outcome: Literal["completed", "failed", "disabled"]
    simulated: bool = False


class SortingOutcome(Envelope):
    event_id: UUID
    outcome: Literal["completed", "failed", "disabled"]
    simulated: bool = False


class CollectionInput(BaseModel):
    category: Category
    operator: str = Field(min_length=1, max_length=100)
    note: str = Field(default="", max_length=500)
