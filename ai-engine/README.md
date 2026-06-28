# AI Engine

Project nay dung de train lai model du doan thoi gian cho kham cho DATN.

## Muc tieu

- Model chinh: `CatBoostRegressor`
- Target train: `target_actual_wait_minutes`
- Output suy luan: `predicted_wait_minutes`
- Cong thuc runtime:
  - `estimated_start_time = checked_in_time + predicted_wait_minutes`
- Baseline can so sanh: `Rule-based Engine`
- Model so sanh them:
  - `Linear Regression`
  - `Random Forest Regressor`
- Chi so danh gia:
  - `MAE`
  - `RMSE`
  - `R²`

## Cau truc

- `src/ai_engine/feature_schema.py`: schema feature, target, baseline
- `src/ai_engine/train.py`: entrypoint dieu phoi train va evaluate
- `src/ai_engine/data/loader.py`: doc du lieu, validate schema, split train/test
- `src/ai_engine/baseline/rule_based_baseline.py`: baseline Rule-based Engine
- `src/ai_engine/evaluation/metrics.py`: MAE, RMSE, R²
- `src/ai_engine/models/catboost_model.py`: train/save CatBoost
- `src/ai_engine/models/linear_regression_model.py`: train/save Linear Regression
- `src/ai_engine/models/random_forest_model.py`: train/save Random Forest
- `src/ai_engine/models/common.py`: preprocessing va helper dung chung cho sklearn
- `src/ai_engine/predict.py`: suy luan CatBoost cho runtime

## Buoc 1: Tao lai du lieu train tu backend

Project nay mac dinh doc:

- `../backend/exports/ai-engine/queue-train-x.csv`
- `../backend/exports/ai-engine/queue-train-y.csv`

Tu thu muc `backend`, chay pipeline export rieng cho `ai-engine`:

```bash
npm run ai-engine:export-training-data
```

File sinh ra:

- `backend/exports/ai-engine/queue-training-data.json`
- `backend/exports/ai-engine/queue-features.csv`
- `backend/exports/ai-engine/queue-train-x.csv`
- `backend/exports/ai-engine/queue-train-y.csv`
- `backend/exports/ai-engine/queue-train-meta.csv`
- `backend/exports/ai-engine/manifest.json`

## Buoc 2: Cai moi truong cho ai-engine

```bash
cd /Users/hienluong/Documents/projects/DATN/ai-engine
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -e .
```

## Buoc 3: Dry-run de kiem tra du lieu

```bash
ai-engine-train --dry-run
```

## Buoc 4: Train va evaluate

```bash
ai-engine-train
```

Train rieng tung model:

```bash
ai-engine-train --model catboost
ai-engine-train --model linear
ai-engine-train --model rf
```

Gia tri hop le cho `--model`:

- `all`: train toan bo model
- `catboost`: chi train `CatBoostRegressor`
- `linear`: chi train `Linear Regression`
- `rf`: chi train `Random Forest Regressor`

Luu y:

- Dung `--model` nao thi `leaderboard.json` van giu baseline `rule_based_engine`
- `test-predictions.csv` chi chua cot prediction cua model da chon
- `manifest.json` ghi ro `selected_model` va `trained_models`

Ket qua se duoc ghi vao:

- `artifacts/latest/leaderboard.json`
- `artifacts/latest/test-predictions.csv`
- `artifacts/latest/models/catboost-regressor.cbm`
- `artifacts/latest/models/linear-regression.joblib`
- `artifacts/latest/models/random-forest-regressor.joblib`

## Buoc 5: Predict bang model CatBoost

```bash
echo '{
  "feature_row": {
    "doctor_id": 1,
    "specialty_id": 2,
    "room_id": 3,
    "queue_number": 5,
    "doctor_daily_queue_count": 18,
    "queues_ahead_total_count": 4,
    "queues_ahead_checked_in_count": 4,
    "queues_ahead_completed_by_checkin_count": 2,
    "queues_ahead_active_backlog_count": 2,
    "queues_ahead_not_checked_in_count": 0,
    "queues_ahead_in_progress_count": 1,
    "completed_ahead_avg_visit_minutes": 14,
    "completed_ahead_total_visit_minutes": 28,
    "minutes_since_last_completed_ahead": 8,
    "appointment_weekday": 2,
    "appointment_month": 5,
    "appointment_day": 6,
    "checked_in_minute_of_day": 510,
    "original_estimated_start_minute_of_day": 540,
    "latest_predicted_start_minute_of_day": 555,
    "checkin_offset_from_original_estimated_start_minutes": -30,
    "checkin_offset_from_latest_predicted_start_minutes": -45,
    "baseline_predicted_wait_minutes": 22
  }
}' | ai-engine-predict
```

Output:

```json
{
  "predicted_wait_minutes": 19,
  "model_name": "catboost_regressor",
  "target_column": "target_actual_wait_minutes",
  "output_column": "predicted_wait_minutes"
}
```

## Ghi chu

- `leaderboard.json` luon chua baseline `rule_based_engine`
- CatBoost la model chinh de deploy
- Hai model con lai chi dung de benchmark
- Khi can benchmark day du, dung `ai-engine-train --model all`
