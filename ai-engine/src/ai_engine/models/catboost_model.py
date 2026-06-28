from __future__ import annotations

from itertools import product

import pandas as pd
from catboost import CatBoostRegressor

from ..evaluation.metrics import compute_metrics
from ..feature_schema import (
    CATBOOST_MODEL_FILENAME,
    CATEGORICAL_COLUMNS,
    FEATURE_COLUMNS,
    PRIMARY_MODEL_NAME,
)
from ..io_utils import ensure_dir


DEFAULT_CATBOOST_PARAMS = {
    "loss_function": "RMSE",
    "eval_metric": "MAE",
    "depth": 8,
    "learning_rate": 0.05,
    "iterations": 800,
    "l2_leaf_reg": 5,
    "random_seed": 42,
    "thread_count": -1,
    "verbose": False,
}

CATBOOST_TUNING_GRID = {
    "loss_function": ["RMSE", "MAE"],
    "depth": [6, 8, 10],
    "learning_rate": [0.04, 0.05, 0.06],
    "l2_leaf_reg": [1, 3, 5],
    "random_strength": [0, 1],
}


def get_cat_feature_indices() -> list[int]:
    return [FEATURE_COLUMNS.index(name) for name in CATEGORICAL_COLUMNS]


def build_catboost_model(params: dict[str, object] | None = None) -> CatBoostRegressor:
    model_params = {**DEFAULT_CATBOOST_PARAMS, **(params or {})}
    return CatBoostRegressor(
        **model_params,
    )


def train_catboost_model(x_train, y_train, x_test, y_test):
    model = build_catboost_model()
    model.fit(
        x_train,
        y_train,
        cat_features=get_cat_feature_indices(),
        eval_set=(x_test, y_test),
        use_best_model=True,
        early_stopping_rounds=80,
    )
    predictions = model.predict(x_test)
    result = {
        "model_name": PRIMARY_MODEL_NAME,
        "model_role": "primary",
        "best_iteration": int(model.get_best_iteration() or DEFAULT_CATBOOST_PARAMS["iterations"]),
        "params": {
            "depth": model.get_param("depth"),
            "learning_rate": model.get_param("learning_rate"),
            "l2_leaf_reg": model.get_param("l2_leaf_reg"),
            "random_strength": model.get_param("random_strength"),
            "loss_function": model.get_param("loss_function"),
            "iterations": model.get_param("iterations"),
        },
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


def _build_param_grid() -> list[dict[str, object]]:
    keys = list(CATBOOST_TUNING_GRID.keys())
    return [
        dict(zip(keys, values))
        for values in product(*(CATBOOST_TUNING_GRID[key] for key in keys))
    ]


def tune_catboost_model(x_train, y_train, x_test, y_test):
    inner_x_train, x_valid, inner_y_train, y_valid = _ordered_validation_split(
        x_train,
        y_train,
    )
    cat_features = get_cat_feature_indices()
    tuning_results = []

    for candidate_params in _build_param_grid():
        model = build_catboost_model({
            **candidate_params,
            "iterations": 1500,
        })
        model.fit(
            inner_x_train,
            inner_y_train,
            cat_features=cat_features,
            eval_set=(x_valid, y_valid),
            use_best_model=True,
            early_stopping_rounds=100,
        )
        validation_predictions = model.predict(x_valid)
        metrics = compute_metrics(y_valid, validation_predictions)
        best_iteration = int(model.get_best_iteration() or model.get_param("iterations"))
        tuning_results.append(
            {
                **candidate_params,
                "iterations": int(model.get_param("iterations")),
                "best_iteration": best_iteration,
                **metrics,
            }
        )

    tuning_results = sorted(tuning_results, key=lambda item: (item["mae"], item["rmse"]))
    best_result = tuning_results[0]
    best_params = {
        key: best_result[key]
        for key in CATBOOST_TUNING_GRID.keys()
    }
    best_params.update({
        "iterations": max(120, int(best_result["best_iteration"]) + 40),
    })

    model = build_catboost_model(best_params)
    model.fit(
        x_train,
        y_train,
        cat_features=cat_features,
    )
    test_predictions = model.predict(x_test)
    test_result = {
        "model_name": PRIMARY_MODEL_NAME,
        "model_role": "primary",
        "tuned": True,
        "validation_best_mae": float(best_result["mae"]),
        "validation_best_rmse": float(best_result["rmse"]),
        "best_iteration": int(best_result["best_iteration"]),
        "params": best_params,
        **compute_metrics(y_test, test_predictions),
    }

    return model, pd.Series(test_predictions, index=x_test.index), test_result, tuning_results


def save_catboost_model(model: CatBoostRegressor, models_dir) -> None:
    ensure_dir(models_dir)
    model.save_model(str(models_dir / CATBOOST_MODEL_FILENAME))
