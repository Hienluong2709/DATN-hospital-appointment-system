from __future__ import annotations

from itertools import product

import pandas as pd
from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, Ridge
from sklearn.pipeline import Pipeline

from ..evaluation.metrics import compute_metrics
from ..feature_schema import (
    LINEAR_REGRESSION_MODEL_FILENAME,
    LINEAR_REGRESSION_MODEL_NAME,
)
from .common import build_sklearn_preprocessor, save_sklearn_model


LINEAR_TUNING_GRID = [
    {"model_type": "linear_regression"},
    *[
        {"model_type": "ridge", "alpha": alpha}
        for alpha in [0.1, 1.0, 5.0, 10.0, 25.0]
    ],
    *[
        {"model_type": "lasso", "alpha": alpha}
        for alpha in [0.001, 0.01, 0.05, 0.1, 0.5]
    ],
    *[
        {"model_type": "elastic_net", "alpha": alpha, "l1_ratio": l1_ratio}
        for alpha, l1_ratio in product([0.001, 0.01, 0.05, 0.1], [0.2, 0.5, 0.8])
    ],
]


def build_linear_estimator(params: dict[str, object] | None = None):
    params = params or {"model_type": "linear_regression"}
    model_type = params.get("model_type")

    if model_type == "ridge":
        return Ridge(alpha=float(params["alpha"]))
    if model_type == "lasso":
        return Lasso(alpha=float(params["alpha"]), max_iter=10000, random_state=42)
    if model_type == "elastic_net":
        return ElasticNet(
            alpha=float(params["alpha"]),
            l1_ratio=float(params["l1_ratio"]),
            max_iter=10000,
            random_state=42,
        )

    return LinearRegression()


def build_linear_regression_pipeline(params: dict[str, object] | None = None) -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocess", build_sklearn_preprocessor()),
            ("model", build_linear_estimator(params)),
        ]
    )


def train_linear_regression_model(x_train, y_train, x_test, y_test):
    model = build_linear_regression_pipeline()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    result = {
        "model_name": LINEAR_REGRESSION_MODEL_NAME,
        "model_role": "benchmark",
        "params": {"model_type": "linear_regression"},
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


def tune_linear_regression_model(x_train, y_train, x_test, y_test):
    inner_x_train, x_valid, inner_y_train, y_valid = _ordered_validation_split(
        x_train,
        y_train,
    )
    tuning_results = []

    for candidate_params in LINEAR_TUNING_GRID:
        model = build_linear_regression_pipeline(candidate_params)
        model.fit(inner_x_train, inner_y_train)
        validation_predictions = model.predict(x_valid)
        metrics = compute_metrics(y_valid, validation_predictions)
        tuning_results.append({**candidate_params, **metrics})

    tuning_results = sorted(tuning_results, key=lambda item: (item["mae"], item["rmse"]))
    best_params = {
        key: value
        for key, value in tuning_results[0].items()
        if key not in {"mae", "rmse", "r2"}
    }

    model = build_linear_regression_pipeline(best_params)
    model.fit(x_train, y_train)
    test_predictions = model.predict(x_test)
    test_result = {
        "model_name": LINEAR_REGRESSION_MODEL_NAME,
        "model_role": "benchmark",
        "tuned": True,
        "validation_best_mae": float(tuning_results[0]["mae"]),
        "validation_best_rmse": float(tuning_results[0]["rmse"]),
        "params": best_params,
        **compute_metrics(y_test, test_predictions),
    }

    return model, pd.Series(test_predictions, index=x_test.index), test_result, tuning_results


def save_linear_regression_model(model, models_dir) -> None:
    save_sklearn_model(model, models_dir / LINEAR_REGRESSION_MODEL_FILENAME)
