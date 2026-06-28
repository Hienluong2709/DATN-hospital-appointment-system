from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from catboost import CatBoostRegressor, Pool

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


def parse_value(raw_value, categorical: bool):
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


def resolve_model_path(payload: dict) -> Path:
    requested = payload.get("model_path")
    return Path(requested).resolve() if requested else DEFAULT_MODEL_PATH.resolve()


def main() -> None:
    raw_payload = sys.stdin.read()
    if not raw_payload.strip():
        raise SystemExit("Missing JSON payload on stdin.")

    payload = json.loads(raw_payload)
    feature_row = payload.get("feature_row") or {}
    model_path = resolve_model_path(payload)

    if not model_path.exists():
        raise SystemExit(f"Model file not found: {model_path}")

    model = CatBoostRegressor()
    model.load_model(str(model_path))

    feature_values = [
        parse_value(feature_row.get(feature_name), feature_name in CATEGORICAL_COLUMNS)
        for feature_name in FEATURE_COLUMNS
    ]
    cat_feature_indices = [
        index
        for index, feature_name in enumerate(FEATURE_COLUMNS)
        if feature_name in CATEGORICAL_COLUMNS
    ]

    feature_pool = Pool(
        data=[feature_values],
        cat_features=cat_feature_indices,
        feature_names=FEATURE_COLUMNS,
    )
    raw_prediction = float(model.predict(feature_pool)[0])

    sys.stdout.write(
        json.dumps(
            {
                OUTPUT_COLUMN: clamp_prediction(raw_prediction),
                "raw_prediction": raw_prediction,
                "model_name": PRIMARY_MODEL_NAME,
                "target_column": TARGET_COLUMN,
                "output_column": OUTPUT_COLUMN,
                "model_path": str(model_path),
            }
        )
    )


if __name__ == "__main__":
    main()
