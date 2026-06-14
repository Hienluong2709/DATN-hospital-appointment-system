from __future__ import annotations

import argparse
import json
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from typing import Any, Optional

from catboost import CatBoostRegressor, Pool
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .feature_schema import (
    CATBOOST_MODEL_FILENAME,
    CATEGORICAL_COLUMNS,
    DEFAULT_ARTIFACT_DIR,
    FEATURE_COLUMNS,
    OUTPUT_COLUMN,
    PRIMARY_MODEL_NAME,
    TARGET_COLUMN,
)

DEFAULT_MODEL_PATH = DEFAULT_ARTIFACT_DIR / "models" / CATBOOST_MODEL_FILENAME
DEFAULT_MANIFEST_PATH = DEFAULT_ARTIFACT_DIR / "manifest.json"
DEFAULT_LEADERBOARD_PATH = DEFAULT_ARTIFACT_DIR / "leaderboard.json"


class PredictionRequest(BaseModel):
    feature_row: dict[str, Any] = Field(default_factory=dict)
    model_path: Optional[str] = None


class ModelRuntime:
    def __init__(self) -> None:
        self._lock = Lock()
        self._model: Optional[CatBoostRegressor] = None
        self._model_path: Optional[Path] = None

    @property
    def model_path(self) -> Path:
        env_model_path = os.getenv("AI_ENGINE_MODEL_PATH")
        return Path(env_model_path).resolve() if env_model_path else DEFAULT_MODEL_PATH.resolve()

    def load(self, model_path: Optional[Path] = None) -> CatBoostRegressor:
        resolved_model_path = (model_path or self.model_path).resolve()
        with self._lock:
            if self._model is not None and self._model_path == resolved_model_path:
                return self._model

            if not resolved_model_path.exists():
                raise FileNotFoundError(f"Model file not found: {resolved_model_path}")

            model = CatBoostRegressor()
            model.load_model(str(resolved_model_path))
            self._model = model
            self._model_path = resolved_model_path
            return model

    def metadata(self) -> dict[str, Any]:
        return {
            "model_loaded": self._model is not None,
            "model_path": str(self._model_path or self.model_path),
            "model_name": PRIMARY_MODEL_NAME,
            "target_column": TARGET_COLUMN,
            "output_column": OUTPUT_COLUMN,
            "feature_columns": FEATURE_COLUMNS,
            "categorical_columns": CATEGORICAL_COLUMNS,
            "artifact_manifest": read_json_file(DEFAULT_MANIFEST_PATH),
            "artifact_leaderboard": read_json_file(DEFAULT_LEADERBOARD_PATH),
        }


runtime = ModelRuntime()


def read_json_file(file_path: Path) -> Any:
    try:
        if not file_path.exists():
            return None
        return json.loads(file_path.read_text(encoding="utf8"))
    except Exception:
        return None


def parse_value(raw_value: Any, categorical: bool) -> Any:
    if raw_value is None or raw_value == "":
        return "" if categorical else None

    if categorical:
        return str(raw_value)

    number = float(raw_value)
    if number.is_integer():
        return int(number)
    return number


def clamp_prediction(value: float) -> int:
    if not isinstance(value, (int, float)) or math.isnan(value) or math.isinf(value):
        return 0
    return max(0, round(value))


def build_feature_pool(feature_row: dict[str, Any]) -> Pool:
    feature_values = [
        parse_value(feature_row.get(feature_name), feature_name in CATEGORICAL_COLUMNS)
        for feature_name in FEATURE_COLUMNS
    ]
    cat_feature_indices = [
        index
        for index, feature_name in enumerate(FEATURE_COLUMNS)
        if feature_name in CATEGORICAL_COLUMNS
    ]

    return Pool(
        data=[feature_values],
        cat_features=cat_feature_indices,
        feature_names=FEATURE_COLUMNS,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    runtime.load()
    yield


app = FastAPI(title="DATN AI Engine", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        **runtime.metadata(),
    }


@app.post("/predict/wait-time")
def predict_wait_time(payload: PredictionRequest) -> dict[str, Any]:
    requested_model_path = Path(payload.model_path).resolve() if payload.model_path else None

    try:
        model = runtime.load(requested_model_path)
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    feature_pool = build_feature_pool(payload.feature_row)
    raw_prediction = float(model.predict(feature_pool)[0])

    return {
        OUTPUT_COLUMN: clamp_prediction(raw_prediction),
        "raw_prediction": raw_prediction,
        "model_name": PRIMARY_MODEL_NAME,
        "target_column": TARGET_COLUMN,
        "output_column": OUTPUT_COLUMN,
        "model_path": str(runtime._model_path or runtime.model_path),
        "runtime": "http_service",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run DATN AI Engine prediction service.")
    parser.add_argument("--host", default=os.getenv("AI_ENGINE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("AI_ENGINE_PORT", "8001")))
    parser.add_argument("--reload", action="store_true")
    return parser.parse_args()


def main() -> None:
    import uvicorn

    args = parse_args()
    uvicorn.run(
        "ai_engine.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
