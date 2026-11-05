from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")
    database_url: str = "sqlite:///./demo.db"
    inference_provider: Literal["mock", "roboflow"] = "mock"
    roboflow_api_key: str = ""
    roboflow_workspace: str = "trinh-dang-khoa-shineekuwu"
    roboflow_workflow: str = "waste-classifier-psdrg-0mtyc"
    roboflow_url: str = "https://serverless.roboflow.com"
    roboflow_output: str = "predictions"
    inference_timeout: float = Field(default=15, gt=0)
    confidence_threshold: float = Field(default=0.65, ge=0, le=1)
    label_mapping: dict[str, str] = {
        "plastic": "recyclable",
        "paper": "recyclable",
        "metal": "recyclable",
        "trash": "non_recyclable",
        "battery": "e_waste",
        "Recyclable": "recyclable",
        "Non-Recyclable": "non_recyclable",
        "E-Waste": "e_waste",
        "Empty": "unknown",
    }
    max_upload_bytes: int = Field(default=2_000_000, gt=0)
    store_images: bool = False
    heartbeat_expiry: int = Field(default=90, gt=0)
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_user: str = "worker"
    mqtt_password: str = "worker-local"


settings = Settings()
