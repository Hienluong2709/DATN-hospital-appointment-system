from __future__ import annotations

from itertools import product

import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline

from ..evaluation.metrics import compute_metrics
from ..feature_schema import (
    RANDOM_FOREST_MODEL_FILENAME,
    RANDOM_FOREST_MODEL_NAME,
)
from .common import build_sklearn_preprocessor, save_sklearn_model


RANDOM_FOREST_DEFAULT_PARAMS = {
    "n_estimators": 400,
    "max_depth": 18,
    "min_samples_leaf": 2,
    "max_features": 1.0,
}

RANDOM_FOREST_TUNING_GRID = {
    "n_estimators": [300, 500],
    "max_depth": [12, 18, None],
    "min_samples_leaf": [1, 2, 4],
    "max_features": ["sqrt", 0.75, 1.0],
}


def _build_param_grid() -> list[dict[str, object]]:
    keys = list(RANDOM_FOREST_TUNING_GRID.keys())
    return [
        dict(zip(keys, values))
        for values in product(*(RANDOM_FOREST_TUNING_GRID[key] for key in keys))
    ]


def build_random_forest_pipeline(params: dict[str, object] | None = None) -> Pipeline:
    model_params = {**RANDOM_FOREST_DEFAULT_PARAMS, **(params or {})}
    return Pipeline(
        steps=[
            ("preprocess", build_sklearn_preprocessor()),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=int(model_params["n_estimators"]),
                    max_depth=model_params["max_depth"],
                    min_samples_leaf=int(model_params["min_samples_leaf"]),
                    max_features=model_params["max_features"],
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
        "params": RANDOM_FOREST_DEFAULT_PARAMS,
        **compute_metrics(y_test, predictions),
    }
    return model, predictions, result


def _ordered_validation_split(x_train, y_train, validation_ratio: float = 0.2):
    split_index = max(1, min(len(x_train) - 1, int(round(len(x_train) * (1 - validation_ratio)))))
    return (
        x_train.iloc[:split_index].copy(),
        x_train.iloc[split_index:].copy(),
        y_train.iloc[:split_index].copy(),
        y_train.iloc[split_index:].copy(),
    )


def tune_random_forest_model(x_train, y_train, x_test, y_test):
    inner_x_train, x_valid, inner_y_train, y_valid = _ordered_validation_split(
        x_train,
        y_train,
    )
    tuning_results = []

    for candidate_params in _build_param_grid():
        model = build_random_forest_pipeline(candidate_params)
        model.fit(inner_x_train, inner_y_train)
        validation_predictions = model.predict(x_valid)
        metrics = compute_metrics(y_valid, validation_predictions)
        tuning_results.append({**candidate_params, **metrics})

    tuning_results = sorted(tuning_results, key=lambda item: (item["mae"], item["rmse"]))
    best_params = {
        key: tuning_results[0][key]
        for key in RANDOM_FOREST_TUNING_GRID.keys()
    }

    model = build_random_forest_pipeline(best_params)
    model.fit(x_train, y_train)
    test_predictions = model.predict(x_test)
    test_result = {
        "model_name": RANDOM_FOREST_MODEL_NAME,
        "model_role": "benchmark",
        "tuned": True,
        "validation_best_mae": float(tuning_results[0]["mae"]),
        "validation_best_rmse": float(tuning_results[0]["rmse"]),
        "params": best_params,
        **compute_metrics(y_test, test_predictions),
    }

    return model, pd.Series(test_predictions, index=x_test.index), test_result, tuning_results


def save_random_forest_model(model, models_dir) -> None:
    save_sklearn_model(model, models_dir / RANDOM_FOREST_MODEL_FILENAME)
