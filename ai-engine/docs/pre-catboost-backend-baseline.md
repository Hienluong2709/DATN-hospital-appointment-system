# Pre-CatBoost Backend Baseline

Ngay chup baseline: `2026-05-06`

## Muc dich

Tai lieu nay ghi lai trang thai backend truoc khi tich hop runtime inference bang `CatBoost`, de doi chieu sau khi tich hop model moi.

## Trang thai runtime hien tai

- Backend dang cau hinh:
  - `QUEUE_AI_FORECAST_PROVIDER=local_heuristic`
  - `QUEUE_AI_COMPARE_WITH_HEURISTIC=false`
- Nguon du doan hien tai:
  - `prediction_source = rule_engine`
  - `model_version = rule_engine_v1`
- File trung tam:
  - `backend/src/services/queueForecastService.js`
- Hien tai `buildAdaptiveWaitingForecast()` tra thang ve `buildRuleBasedWaitingForecast()`, nghia la runtime forecast dang thuần rule-based, chua goi model CatBoost.

## Du lieu baseline de benchmark

Du lieu duoc export bang:

```bash
cd backend
npm run ai-engine:export-training-data
```

Tom tat dataset:

- `raw_rows`: `6390`
- `train_rows`: `6384`
- `feature_count`: `23`
- `target_column`: `target_actual_wait_minutes`
- `output_column`: `predicted_wait_minutes`

Feature columns:

- `doctor_id`
- `specialty_id`
- `room_id`
- `queue_number`
- `doctor_daily_queue_count`
- `queues_ahead_total_count`
- `queues_ahead_checked_in_count`
- `queues_ahead_completed_by_checkin_count`
- `queues_ahead_active_backlog_count`
- `queues_ahead_not_checked_in_count`
- `queues_ahead_in_progress_count`
- `completed_ahead_avg_visit_minutes`
- `completed_ahead_total_visit_minutes`
- `minutes_since_last_completed_ahead`
- `appointment_weekday`
- `appointment_month`
- `appointment_day`
- `checked_in_minute_of_day`
- `original_estimated_start_minute_of_day`
- `latest_predicted_start_minute_of_day`
- `checkin_offset_from_original_estimated_start_minutes`
- `checkin_offset_from_latest_predicted_start_minutes`
- `baseline_predicted_wait_minutes`

## Ket qua benchmark hien tai

Ket qua duoc tao bang:

```bash
cd ai-engine
.venv/bin/python -m ai_engine.train
```

Bang ket qua:

| Model | Vai tro | MAE | RMSE | R2 |
|---|---|---:|---:|---:|
| CatBoost Regressor | Primary | 8.0878 | 11.4328 | 0.8081 |
| Random Forest Regressor | Benchmark | 8.3286 | 12.5575 | 0.7685 |
| Linear Regression | Benchmark | 9.0120 | 14.0415 | 0.7106 |
| Rule-based Engine | Baseline backend hien tai | 12.0728 | 19.9844 | 0.4137 |

## Moc so sanh sau khi tich hop CatBoost

Sau khi tich hop runtime CatBoost vao backend, can so lai toi thieu cac diem sau:

1. `prediction_source` co chuyen tu `rule_engine` sang nguon CatBoost hay khong.
2. `model_version` co phan biet duoc model CatBoost dang deploy hay khong.
3. `predicted_wait_minutes` tren runtime co gan hon ket qua thuc te so voi baseline rule-based hay khong.
4. `estimated_start_time = checked_in_time + predicted_wait_minutes` co on dinh tren cac ca dang cho hay khong.
5. MAE, RMSE, R2 cua runtime CatBoost co tot hon moc baseline:
   - `MAE = 12.0728`
   - `RMSE = 19.9844`
   - `R2 = 0.4137`

## File tham chieu

- `backend/.env`
- `backend/src/services/queueForecastService.js`
- `backend/exports/ai-engine/manifest.json`
- `ai-engine/artifacts/latest/leaderboard.json`
