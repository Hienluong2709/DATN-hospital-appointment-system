from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PROJECT_ROOT.parent
DEFAULT_X_PATH = REPO_ROOT / "backend" / "exports" / "ai-engine" / "queue-train-x.csv"
DEFAULT_Y_PATH = REPO_ROOT / "backend" / "exports" / "ai-engine" / "queue-train-y.csv"
DEFAULT_ARTIFACT_DIR = PROJECT_ROOT / "artifacts" / "latest"

TARGET_COLUMN = "target_actual_wait_minutes"
OUTPUT_COLUMN = "predicted_wait_minutes"
BASELINE_MODEL_NAME = "rule_based_engine"
PRIMARY_MODEL_NAME = "catboost_regressor"
LINEAR_REGRESSION_MODEL_NAME = "linear_regression"
RANDOM_FOREST_MODEL_NAME = "random_forest_regressor"

CATBOOST_MODEL_FILENAME = "catboost-regressor.cbm"
LINEAR_REGRESSION_MODEL_FILENAME = "linear-regression.joblib"
RANDOM_FOREST_MODEL_FILENAME = "random-forest-regressor.joblib"

FEATURE_COLUMNS = [
    "doctor_id",
    "specialty_id",
    "room_id",
    "queue_number",
    "doctor_daily_queue_count",
    "queues_ahead_total_count",
    "queues_ahead_checked_in_count",
    "queues_ahead_completed_by_checkin_count",
    "queues_ahead_active_backlog_count",
    "queues_ahead_not_checked_in_count",
    "queues_ahead_in_progress_count",
    "completed_ahead_avg_visit_minutes",
    "completed_ahead_total_visit_minutes",
    "minutes_since_last_completed_ahead",
    "appointment_weekday",
    "appointment_month",
    "appointment_day",
    "checked_in_minute_of_day",
    "original_estimated_start_minute_of_day",
    "latest_predicted_start_minute_of_day",
    "checkin_offset_from_original_estimated_start_minutes",
    "checkin_offset_from_latest_predicted_start_minutes",
    "baseline_predicted_wait_minutes",
]

CATEGORICAL_COLUMNS = [
    "doctor_id",
    "specialty_id",
    "room_id",
]

BASELINE_FEATURE = "baseline_predicted_wait_minutes"
