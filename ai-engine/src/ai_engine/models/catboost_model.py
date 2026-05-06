from __future__ import annotations

from catboost import CatBoostRegressor

from ..evaluation.metrics import compute_metrics
from ..feature_schema import (
    CATBOOST_MODEL_FILENAME,
    CATEGORICAL_COLUMNS,
    FEATURE_COLUMNS,
    PRIMARY_MODEL_NAME,
)
from ..io_utils import ensure_dir


def build_catboost_model() -> CatBoostRegressor:
    return CatBoostRegressor(
        loss_function="RMSE",
        eval_metric="RMSE",
        depth=8,
        learning_rate=0.05,
        iterations=800,
        l2_leaf_reg=5,
        random_seed=42,
        verbose=False,
    )


def train_catboost_model(x_train, y_train, x_test, y_test):
    model = build_catboost_model()
    model.fit(
        x_train,
        y_train,
        cat_features=[FEATURE_COLUMNS.index(name) for name in CATEGORICAL_COLUMNS],
        eval_set=(x_test, y_test),
        use_best_model=True,
    )
    predictions = model.predict(x_test)
    result = {
        "model_name": PRIMARY_MODEL_NAME,
        "model_role": "primary",
        **compute_metrics(y_test, predictions),
    }
    return model, predictions, result


def save_catboost_model(model: CatBoostRegressor, models_dir) -> None:
    ensure_dir(models_dir)
    model.save_model(str(models_dir / CATBOOST_MODEL_FILENAME))
