from __future__ import annotations

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ..evaluation.metrics import compute_metrics
from ..feature_schema import (
    CATEGORICAL_COLUMNS,
    FEATURE_COLUMNS,
    NEURAL_NETWORK_MODEL_FILENAME,
    NEURAL_NETWORK_MODEL_NAME,
)
from .common import save_sklearn_model


NEURAL_NETWORK_DEFAULT_PARAMS = {
    "hidden_layer_sizes": (128, 64, 32),
    "activation": "relu",
    "alpha": 0.001,
    "learning_rate_init": 0.001,
    "max_iter": 800,
}

NEURAL_NETWORK_TUNING_GRID = [
    {
        "hidden_layer_sizes": (96, 48),
        "alpha": 0.0005,
        "learning_rate_init": 0.001,
    },
    {
        "hidden_layer_sizes": (128, 64),
        "alpha": 0.001,
        "learning_rate_init": 0.001,
    },
    {
        "hidden_layer_sizes": (128, 64, 32),
        "alpha": 0.001,
        "learning_rate_init": 0.001,
    },
    {
        "hidden_layer_sizes": (192, 96, 48),
        "alpha": 0.002,
        "learning_rate_init": 0.0008,
    },
]


def build_neural_network_preprocessor() -> ColumnTransformer:
    numeric_columns = [column for column in FEATURE_COLUMNS if column not in CATEGORICAL_COLUMNS]
    return ColumnTransformer(
        transformers=[
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                    ]
                ),
                CATEGORICAL_COLUMNS,
            ),
            (
                "numeric",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_columns,
            ),
        ]
    )


def build_neural_network_pipeline(params: dict[str, object] | None = None) -> Pipeline:
    model_params = {**NEURAL_NETWORK_DEFAULT_PARAMS, **(params or {})}
    return Pipeline(
        steps=[
            ("preprocess", build_neural_network_preprocessor()),
            (
                "model",
                MLPRegressor(
                    hidden_layer_sizes=model_params["hidden_layer_sizes"],
                    activation=model_params["activation"],
                    alpha=float(model_params["alpha"]),
                    learning_rate_init=float(model_params["learning_rate_init"]),
                    max_iter=int(model_params["max_iter"]),
                    early_stopping=True,
                    validation_fraction=0.15,
                    n_iter_no_change=30,
                    random_state=42,
                ),
            ),
        ]
    )


def train_neural_network_model(x_train, y_train, x_test, y_test):
    model = build_neural_network_pipeline()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    result = {
        "model_name": NEURAL_NETWORK_MODEL_NAME,
        "model_role": "deep_learning_benchmark",
        "params": NEURAL_NETWORK_DEFAULT_PARAMS,
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


def tune_neural_network_model(x_train, y_train, x_test, y_test):
    inner_x_train, x_valid, inner_y_train, y_valid = _ordered_validation_split(
        x_train,
        y_train,
    )
    tuning_results = []

    for candidate_params in NEURAL_NETWORK_TUNING_GRID:
        model = build_neural_network_pipeline(candidate_params)
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

    model = build_neural_network_pipeline(best_params)
    model.fit(x_train, y_train)
    test_predictions = model.predict(x_test)
    test_result = {
        "model_name": NEURAL_NETWORK_MODEL_NAME,
        "model_role": "deep_learning_benchmark",
        "tuned": True,
        "validation_best_mae": float(tuning_results[0]["mae"]),
        "validation_best_rmse": float(tuning_results[0]["rmse"]),
        "params": best_params,
        **compute_metrics(y_test, test_predictions),
    }

    return model, pd.Series(test_predictions, index=x_test.index), test_result, tuning_results


def save_neural_network_model(model, models_dir) -> None:
    save_sklearn_model(model, models_dir / NEURAL_NETWORK_MODEL_FILENAME)
