from __future__ import annotations

import joblib

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from ..feature_schema import CATEGORICAL_COLUMNS, FEATURE_COLUMNS
from ..io_utils import ensure_dir


def build_sklearn_preprocessor() -> ColumnTransformer:
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
                    ]
                ),
                numeric_columns,
            ),
        ]
    )


def save_sklearn_model(model, output_path) -> None:
    ensure_dir(output_path.parent)
    joblib.dump(model, output_path)
