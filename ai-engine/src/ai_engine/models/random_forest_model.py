from __future__ import annotations

from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline

from ..evaluation.metrics import compute_metrics
from ..feature_schema import (
    RANDOM_FOREST_MODEL_FILENAME,
    RANDOM_FOREST_MODEL_NAME,
)
from .common import build_sklearn_preprocessor, save_sklearn_model


def build_random_forest_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocess", build_sklearn_preprocessor()),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=400,
                    max_depth=18,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )


def train_random_forest_model(x_train, y_train, x_test, y_test):
    model = build_random_forest_pipeline()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    result = {
        "model_name": RANDOM_FOREST_MODEL_NAME,
        "model_role": "benchmark",
        **compute_metrics(y_test, predictions),
    }
    return model, predictions, result


def save_random_forest_model(model, models_dir) -> None:
    save_sklearn_model(model, models_dir / RANDOM_FOREST_MODEL_FILENAME)
