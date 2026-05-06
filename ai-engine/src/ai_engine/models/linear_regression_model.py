from __future__ import annotations

from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline

from ..evaluation.metrics import compute_metrics
from ..feature_schema import (
    LINEAR_REGRESSION_MODEL_FILENAME,
    LINEAR_REGRESSION_MODEL_NAME,
)
from .common import build_sklearn_preprocessor, save_sklearn_model


def build_linear_regression_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocess", build_sklearn_preprocessor()),
            ("model", LinearRegression()),
        ]
    )


def train_linear_regression_model(x_train, y_train, x_test, y_test):
    model = build_linear_regression_pipeline()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    result = {
        "model_name": LINEAR_REGRESSION_MODEL_NAME,
        "model_role": "benchmark",
        **compute_metrics(y_test, predictions),
    }
    return model, predictions, result


def save_linear_regression_model(model, models_dir) -> None:
    save_sklearn_model(model, models_dir / LINEAR_REGRESSION_MODEL_FILENAME)
