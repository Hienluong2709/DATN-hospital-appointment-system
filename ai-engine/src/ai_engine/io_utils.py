from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from .feature_schema import FEATURE_COLUMNS


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_training_frames(x_path: Path, y_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    if not x_path.exists():
        raise FileNotFoundError(f"Training feature file not found: {x_path}")
    if not y_path.exists():
        raise FileNotFoundError(f"Training target file not found: {y_path}")

    x_frame = pd.read_csv(x_path)
    y_frame = pd.read_csv(y_path)

    missing_features = [column for column in FEATURE_COLUMNS if column not in x_frame.columns]
    if missing_features:
        raise ValueError(
            "Training feature file is missing required columns: "
            + ", ".join(missing_features)
        )

    if len(x_frame) != len(y_frame):
        raise ValueError(
            f"Feature/target row count mismatch: {len(x_frame)} != {len(y_frame)}"
        )

    return x_frame, y_frame


def write_json(path: Path, payload: object) -> None:
    ensure_parent_dir(path)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def write_dataframe_csv(path: Path, frame: pd.DataFrame) -> None:
    ensure_parent_dir(path)
    frame.to_csv(path, index=False)

