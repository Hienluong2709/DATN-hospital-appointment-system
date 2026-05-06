from __future__ import annotations

import math

from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def compute_metrics(actual, predicted) -> dict[str, float]:
    mae = float(mean_absolute_error(actual, predicted))
    rmse = float(math.sqrt(mean_squared_error(actual, predicted)))
    r2 = float(r2_score(actual, predicted))
    return {"mae": mae, "rmse": rmse, "r2": r2}

