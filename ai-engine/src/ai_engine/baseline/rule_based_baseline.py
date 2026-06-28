from __future__ import annotations

from ..evaluation.metrics import compute_metrics
from ..feature_schema import BASELINE_FEATURE, BASELINE_MODEL_NAME


def run_rule_based_baseline(x_test, y_test):
    if BASELINE_FEATURE not in x_test.columns:
        raise ValueError(f"Baseline feature `{BASELINE_FEATURE}` not found in feature frame.")

    predictions = x_test[BASELINE_FEATURE].fillna(0)
    result = {
        "model_name": BASELINE_MODEL_NAME,
        "model_role": "baseline",
        **compute_metrics(y_test, predictions),
    }
    return predictions, result
