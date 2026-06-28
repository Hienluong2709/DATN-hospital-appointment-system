from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..feature_schema import (
    BASELINE_FEATURE,
    BASELINE_MODEL_NAME,
    CATEGORICAL_COLUMNS,
    FEATURE_COLUMNS,
    LINEAR_REGRESSION_MODEL_NAME,
    OUTPUT_COLUMN,
    PRIMARY_MODEL_NAME,
    RANDOM_FOREST_MODEL_NAME,
)
from ..io_utils import load_training_frames


def load_dataset(x_path: Path, y_path: Path, target_column: str) -> tuple[pd.DataFrame, pd.Series]:
    x_frame, y_frame = load_training_frames(x_path, y_path)

    if target_column not in y_frame.columns:
        raise ValueError(
            f"Target column `{target_column}` not found. "
            f"Available: {', '.join(y_frame.columns)}"
        )

    return x_frame[FEATURE_COLUMNS].copy(), y_frame[target_column].copy()


def ordered_split(x_frame: pd.DataFrame, y_series: pd.Series, test_ratio: float):
    if not 0 < test_ratio < 1:
        raise ValueError("--test-ratio must be in the range (0, 1)")

    if len(x_frame) < 10:
        raise ValueError("Dataset is too small to split reliably. Need at least 10 rows.")

    split_index = max(1, min(len(x_frame) - 1, int(round(len(x_frame) * (1 - test_ratio)))))
    return (
        x_frame.iloc[:split_index].copy(),
        x_frame.iloc[split_index:].copy(),
        y_series.iloc[:split_index].copy(),
        y_series.iloc[split_index:].copy(),
    )


def build_dry_run_summary(x_path: Path, y_path: Path, x_frame: pd.DataFrame, target_column: str) -> dict:
    return {
        "x_path": str(x_path),
        "y_path": str(y_path),
        "rows_total": int(len(x_frame)),
        "feature_count": len(FEATURE_COLUMNS),
        "target_column": target_column,
        "categorical_columns": CATEGORICAL_COLUMNS,
        "baseline_feature": BASELINE_FEATURE,
        "models": [
            PRIMARY_MODEL_NAME,
            LINEAR_REGRESSION_MODEL_NAME,
            RANDOM_FOREST_MODEL_NAME,
            BASELINE_MODEL_NAME,
        ],
        "output_column": OUTPUT_COLUMN,
    }
