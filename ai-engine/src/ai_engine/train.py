from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .baseline.rule_based_baseline import run_rule_based_baseline
from .data.loader import build_dry_run_summary, load_dataset, ordered_split
from .feature_schema import (
    CATEGORICAL_COLUMNS,
    DEFAULT_ARTIFACT_DIR,
    DEFAULT_X_PATH,
    DEFAULT_Y_PATH,
    FEATURE_COLUMNS,
    LINEAR_REGRESSION_MODEL_NAME,
    NEURAL_NETWORK_MODEL_NAME,
    OUTPUT_COLUMN,
    PRIMARY_MODEL_NAME,
    RANDOM_FOREST_MODEL_NAME,
    TARGET_COLUMN,
)
from .io_utils import ensure_dir, write_dataframe_csv, write_json
from .models.catboost_model import save_catboost_model, train_catboost_model, tune_catboost_model
from .models.linear_regression_model import (
    save_linear_regression_model,
    train_linear_regression_model,
    tune_linear_regression_model,
)
from .models.random_forest_model import (
    save_random_forest_model,
    train_random_forest_model,
    tune_random_forest_model,
)
from .models.neural_network_model import (
    save_neural_network_model,
    train_neural_network_model,
    tune_neural_network_model,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train queue wait prediction models for DATN."
    )
    parser.add_argument("--x-path", type=Path, default=DEFAULT_X_PATH)
    parser.add_argument("--y-path", type=Path, default=DEFAULT_Y_PATH)
    parser.add_argument("--target-column", default=TARGET_COLUMN)
    parser.add_argument("--test-ratio", type=float, default=0.2)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument(
        "--model",
        choices=["all", "catboost", "linear", "rf", "nn"],
        default="all",
        help="Train all models or only one specific model.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--tune-catboost",
        action="store_true",
        help="Run CatBoost hyperparameter tuning on an inner validation split before final training.",
    )
    parser.add_argument(
        "--tune-linear",
        action="store_true",
        help="Tune linear-family benchmark models on an inner validation split.",
    )
    parser.add_argument(
        "--tune-rf",
        action="store_true",
        help="Tune Random Forest hyperparameters on an inner validation split.",
    )
    parser.add_argument(
        "--tune-nn",
        action="store_true",
        help="Tune neural network benchmark hyperparameters on an inner validation split.",
    )
    parser.add_argument(
        "--tune-all",
        action="store_true",
        help="Tune every trainable model family before final test evaluation.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    x_frame, y_series = load_dataset(args.x_path, args.y_path, args.target_column)

    if args.dry_run:
        summary = build_dry_run_summary(args.x_path, args.y_path, x_frame, args.target_column)
        summary["selected_model"] = args.model
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    x_train, x_test, y_train, y_test = ordered_split(x_frame, y_series, args.test_ratio)

    baseline_predictions, baseline_result = run_rule_based_baseline(x_test, y_test)
    results: list[dict[str, object]] = []
    results.append(baseline_result)
    selected_prediction_columns: dict[str, pd.Series] = {
        "baseline_predicted_wait_minutes": baseline_predictions.reset_index(drop=True)
    }
    selected_model_names: list[str] = []

    catboost_model = None
    catboost_tuning_results = None
    linear_model = None
    linear_tuning_results = None
    random_forest_model = None
    random_forest_tuning_results = None
    neural_network_model = None
    neural_network_tuning_results = None
    tune_catboost = args.tune_catboost or args.tune_all
    tune_linear = args.tune_linear or args.tune_all
    tune_rf = args.tune_rf or args.tune_all
    tune_nn = args.tune_nn or args.tune_all

    if args.model in {"all", "catboost"}:
        if tune_catboost:
            (
                catboost_model,
                catboost_predictions,
                catboost_result,
                catboost_tuning_results,
            ) = tune_catboost_model(
                x_train,
                y_train,
                x_test,
                y_test,
            )
        else:
            catboost_model, catboost_predictions, catboost_result = train_catboost_model(
                x_train,
                y_train,
                x_test,
                y_test,
            )
        catboost_predictions = pd.Series(catboost_predictions, index=x_test.index)
        results.append(catboost_result)
        selected_prediction_columns["catboost_predicted_wait_minutes"] = (
            catboost_predictions.reset_index(drop=True)
        )
        selected_model_names.append(PRIMARY_MODEL_NAME)

    if args.model in {"all", "linear"}:
        if tune_linear:
            (
                linear_model,
                linear_predictions,
                linear_result,
                linear_tuning_results,
            ) = tune_linear_regression_model(
                x_train,
                y_train,
                x_test,
                y_test,
            )
        else:
            linear_model, linear_predictions, linear_result = train_linear_regression_model(
                x_train,
                y_train,
                x_test,
                y_test,
            )
        linear_predictions = pd.Series(linear_predictions, index=x_test.index)
        results.append(linear_result)
        selected_prediction_columns["linear_regression_predicted_wait_minutes"] = (
            linear_predictions.reset_index(drop=True)
        )
        selected_model_names.append(LINEAR_REGRESSION_MODEL_NAME)

    if args.model in {"all", "rf"}:
        if tune_rf:
            (
                random_forest_model,
                random_forest_predictions,
                random_forest_result,
                random_forest_tuning_results,
            ) = tune_random_forest_model(
                x_train,
                y_train,
                x_test,
                y_test,
            )
        else:
            random_forest_model, random_forest_predictions, random_forest_result = (
                train_random_forest_model(
                    x_train,
                    y_train,
                    x_test,
                    y_test,
                )
            )
        random_forest_predictions = pd.Series(random_forest_predictions, index=x_test.index)
        results.append(random_forest_result)
        selected_prediction_columns["random_forest_predicted_wait_minutes"] = (
            random_forest_predictions.reset_index(drop=True)
        )
        selected_model_names.append(RANDOM_FOREST_MODEL_NAME)

    if args.model in {"all", "nn"}:
        if tune_nn:
            (
                neural_network_model,
                neural_network_predictions,
                neural_network_result,
                neural_network_tuning_results,
            ) = tune_neural_network_model(
                x_train,
                y_train,
                x_test,
                y_test,
            )
        else:
            neural_network_model, neural_network_predictions, neural_network_result = (
                train_neural_network_model(
                    x_train,
                    y_train,
                    x_test,
                    y_test,
                )
            )
        neural_network_predictions = pd.Series(neural_network_predictions, index=x_test.index)
        results.append(neural_network_result)
        selected_prediction_columns["neural_network_predicted_wait_minutes"] = (
            neural_network_predictions.reset_index(drop=True)
        )
        selected_model_names.append(NEURAL_NETWORK_MODEL_NAME)

    artifact_dir = args.artifact_dir
    models_dir = artifact_dir / "models"
    ensure_dir(models_dir)

    if catboost_model is not None:
        save_catboost_model(catboost_model, models_dir)
    if catboost_tuning_results is not None:
        write_json(artifact_dir / "catboost-tuning-results.json", catboost_tuning_results)
    if linear_tuning_results is not None:
        write_json(artifact_dir / "linear-tuning-results.json", linear_tuning_results)
    if random_forest_tuning_results is not None:
        write_json(artifact_dir / "random-forest-tuning-results.json", random_forest_tuning_results)
    if neural_network_tuning_results is not None:
        write_json(artifact_dir / "neural-network-tuning-results.json", neural_network_tuning_results)
    if linear_model is not None:
        save_linear_regression_model(linear_model, models_dir)
    if random_forest_model is not None:
        save_random_forest_model(random_forest_model, models_dir)
    if neural_network_model is not None:
        save_neural_network_model(neural_network_model, models_dir)

    leaderboard = sorted(results, key=lambda item: item["mae"])
    write_json(artifact_dir / "leaderboard.json", leaderboard)

    prediction_frame = pd.DataFrame({"actual_wait_minutes": y_test.reset_index(drop=True)})
    for column_name, column_values in selected_prediction_columns.items():
        prediction_frame[column_name] = column_values
    write_dataframe_csv(artifact_dir / "test-predictions.csv", prediction_frame)

    manifest = {
        "target_column": args.target_column,
        "output_column": OUTPUT_COLUMN,
        "selected_model": args.model,
        "rows_total": int(len(x_frame)),
        "rows_train": int(len(x_train)),
        "rows_test": int(len(x_test)),
        "feature_columns": FEATURE_COLUMNS,
        "categorical_columns": CATEGORICAL_COLUMNS,
        "primary_model": PRIMARY_MODEL_NAME,
        "trained_models": selected_model_names,
        "benchmark_models": [
            LINEAR_REGRESSION_MODEL_NAME,
            RANDOM_FOREST_MODEL_NAME,
            NEURAL_NETWORK_MODEL_NAME,
        ],
        "catboost_tuned": bool(tune_catboost and catboost_tuning_results is not None),
        "linear_tuned": bool(tune_linear and linear_tuning_results is not None),
        "random_forest_tuned": bool(tune_rf and random_forest_tuning_results is not None),
        "neural_network_tuned": bool(tune_nn and neural_network_tuning_results is not None),
    }
    write_json(artifact_dir / "manifest.json", manifest)

    print(pd.DataFrame(leaderboard).to_string(index=False))


if __name__ == "__main__":
    main()
