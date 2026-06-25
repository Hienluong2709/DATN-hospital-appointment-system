# Rule-Engine Queue Forecast Formula Documentation

## Tổng Quan
Hệ thống sử dụng **hybrid forecasting approach** để dự đoán thời gian chờ hàng cho bệnh nhân. Công thức kết hợp giữa:
1. **Rule-based (Heuristic) Forecast** - Tính toán dựa trên quy luật cơ bản
2. **AI-based Forecast** (CatBoost) - Dự đoán machine learning khi có dữ liệu đủ

---

## 1. CÔNG THỨC RULE-BASED (HEURISTIC)

### Tham số Cơ Bản
```javascript
const DEFAULT_QUEUE_VISIT_DURATION_MINUTES = 15;  // Thời gian khám bình thường
const DEFAULT_QUEUE_TURNAROUND_MINUTES = 5;       // Thời gian buffer giữa 2 bệnh nhân
const MAX_CHECKED_IN_EARLY_CALL_MINUTES = 10;     // Thời gian gọi trước sớm nhất
```

### 1.1 Tính Thời Gian Khám Trung Bình (Average Visit Duration)

```
averageVisitDurationMinutes = median(completedDurations) * 0.65 + 
                              trimmedAverage(completedDurations) * 0.35
```

**Chi tiết:**
- Lấy 20 lần khám hoàn thành gần nhất của bác sĩ
- Tính toán từ `actual_end - actual_start`
- Chỉ tính những khám từ 5 đến 60 phút
- **Trung vị (Median)**: 65% trọng số - ổn định
- **Trimmed Average**: 35% trọng số - loại bỏ outlier (cắt 15% đầu và cuối)
- Kết quả cuối cùng: clamped từ 5 đến 180 phút

**Công thức chi tiết:**
```
sorted_durations = sort(validDurations)
trimCount = floor(length * 0.15)
trimmed_values = sorted_durations[trimCount : length - trimCount]
trimmedAverage = sum(trimmed_values) / length(trimmed_values)
median = sorted_durations[floor(length/2)] hoặc trung bình 2 giá trị giữa

weightedDuration = median * 0.65 + trimmedAverage * 0.35
result = clamp(round(weightedDuration), 5, 180)
```

### 1.2 Xây Dựng Rule-Based Forecast

**Input:**
- `checkedInAt`: Thời điểm bệnh nhân check-in
- `forecastCursor`: Con trỏ dự báo hiện tại (thời gian sớm nhất khác bác sĩ có thể bắt đầu)
- `originalScheduledTime`: Giờ hẹn ban đầu
- `earliestWorkingDateTime`: Giờ làm việc sớm nhất
- `workingPeriods`: Các khoảng thời gian làm việc
- `now`: Thời gian hiện tại

**Bước 1: Xác định Earliest Eligible Start Time**
```
if originalScheduledTime tồn tại:
    earliestEligibleStartTime = max(
        originalScheduledTime - MAX_CHECKED_IN_EARLY_CALL_MINUTES,
        earliestWorkingDateTime
    )
else:
    earliestEligibleStartTime = earliestWorkingDateTime
```

**Bước 2: Xác định Timing Floor**
```
if checkedInAt tồn tại:
    timingFloor = max(checkedInAt, now)
else:
    timingFloor = earliestEligibleStartTime || earliestWorkingDateTime
```

**Bước 3: Tính Base Time (Thời gian gốc dự báo)**
```
baseTime = max(forecastCursor, earliestEligibleStartTime, 
               earliestWorkingDateTime, timingFloor) || now
```

**Bước 4: Tính Predicted Wait Minutes**
```
predictionAnchor = checkedInAt || originalScheduledTime || 
                   earliestWorkingDateTime || baseTime

predictedWaitMinutes = max(0, ceil((baseTime - predictionAnchor) / 60000))
                     // Kết quả tính bằng millisecond, chuyển sang phút
```

**Bước 5: Derive Predicted Start (Normalize trong Working Periods)**
```
if checkedInAt và predictedWaitMinutes >= 0:
    estimatedStart = max(checkedInAt + predictedWaitMinutes, baseTime)
    // Sau đó normalize trong workingPeriods
else:
    estimatedStart = persistedEstimatedStart || originalScheduledTime || 
                     fallbackDateTime
```

**Output:**
```javascript
{
    estimated_start: estimatedStart,
    predicted_wait_minutes: predictedWaitMinutes,
    prediction_source: "rule_engine",
    model_version: "rule_engine_v1",
    base_time: baseTime
}
```

---

## 2. CÔNG THỨC CHO MỖI QUEUE TRONG DANH SÁCH

### 2.1 Quy Trình Tính Forecast cho Mỗi Queue

**Cho mỗi queue trong danh sách sắp xếp theo thứ tự phục vụ:**

```
for each queue in queueLikeItems sorted by serviceOrder:
    
    // Bước 1: Lấy các timestamps
    checkedInAt = queue.checked_in_at (convert to Date)
    originalScheduledTime = estimateOriginalQueueDateTime(queue)
    
    // Bước 2: Xử lý completed/in-progress queues
    if queue.actual_start && queue.actual_end:
        // Đã hoàn thành
        predictedWaitMinutes = computePredictedWaitMinutesFromAnchor(
            estimatedStart, checkedInAt
        )
        forecastCursor = max(forecastCursor, 
                            queue.actual_end + turnaroundBuffer)
    
    else if queue.actual_start:
        // Đang phục vụ
        predictedWaitMinutes = computePredictedWaitMinutesFromAnchor(
            estimatedStart, checkedInAt
        )
        forecastCursor = buildInProgressForecastCursor(
            actualStart = queue.actual_start,
            averageVisitDurationMs = averageVisitDuration * 60000,
            turnaroundBufferMs = 5 * 60000,
            now = now
        )
    
    else:
        // Chưa bắt đầu - sử dụng Adaptive Forecast
        adaptiveForecast = buildAdaptiveWaitingForecast({
            checkedInAt,
            forecastCursor,
            originalScheduledTime,
            earliestWorkingDateTime,
            workingPeriods,
            now,
            averageVisitDurationMinutes,
            turnaroundBufferMinutes = 5
        })
        
        predictedWaitMinutes = adaptiveForecast.predicted_wait_minutes
        estimatedStart = adaptiveForecast.estimated_start
        forecastCursor = estimatedStart + averageVisitDuration + turnaroundBuffer
```

### 2.2 Build In-Progress Forecast Cursor

```
buildInProgressForecastCursor = max(
    actualStart + averageVisitDurationMs + turnaroundBufferMs,
    now + turnaroundBufferMs
)
```

---

## 3. CÔNG THỨC AI-BASED (CATBOOST)

### 3.1 Feature Engineering cho CatBoost Model

Các features đầu vào cho mô hình:

```javascript
{
    // Doctor & Queue Info
    doctor_id: queueLike.doctor_id,
    specialty_id: doctor.specialty_id,
    room_id: doctor.room_id,
    queue_number: queueLike.queue_number,
    doctor_daily_queue_count: total_queues_today,
    
    // Queue Position Analysis
    queues_ahead_total_count: tất cả queues phía trước,
    queues_ahead_checked_in_count: queues phía trước đã check-in,
    queues_ahead_completed_by_checkin_count: hoàn thành trước check-in time,
    queues_ahead_active_backlog_count: checked_in nhưng chưa hoàn thành,
    queues_ahead_not_checked_in_count: chưa check-in,
    queues_ahead_in_progress_count: đang phục vụ,
    
    // Historical Duration
    completed_ahead_avg_visit_minutes: Trung bình thời gian khám của queues hoàn thành,
    completed_ahead_total_visit_minutes: Tổng thời gian,
    minutes_since_last_completed_ahead: Khoảng cách từ lần khám cuối cùng hoàn thành,
    
    // Time Features
    appointment_weekday: (0-6, 0=Sunday),
    appointment_month: (1-12),
    appointment_day: (1-31),
    checked_in_minute_of_day: phút trong ngày (0-1440),
    original_estimated_start_minute_of_day,
    latest_predicted_start_minute_of_day,
    
    // Time Offsets
    checkin_offset_from_original_estimated_start_minutes,
    checkin_offset_from_latest_predicted_start_minutes,
    
    // Baseline
    baseline_predicted_wait_minutes: rule_engine prediction
}
```

### 3.2 CatBoost Inference

```python
def predict_catboost(feature_row):
    model = CatBoostRegressor()
    model.load_model(model_path)
    
    # Parse features
    feature_values = [parse_value(feature_row[feature], is_categorical)
                      for feature in FEATURE_COLUMNS]
    
    # Create pool with categorical features
    pool = Pool(
        data=[feature_values],
        cat_features=categorical_feature_indices,
        feature_names=FEATURE_COLUMNS
    )
    
    # Get prediction
    raw_prediction = model.predict(pool)[0]
    
    # Clamp result
    clamped_prediction = max(0, round(raw_prediction))
    
    return clamped_prediction
```

**Output:** Predicted wait minutes (0 đến 480 phút = 8 giờ max)

---

## 4. HYBRID FORECAST LOGIC

### 4.1 Quy Trình Lựa Chọn

```javascript
buildAdaptiveWaitingForecast = async ({
    // ... parameters
}) => {
    // Bước 1: Tính Rule-Based forecast
    ruleBasedForecast = buildRuleBasedWaitingForecast({...})
    
    // Bước 2: Nếu chưa check-in, không có AI prediction
    if !checkedInAt:
        return ruleBasedForecast
    
    // Bước 3: Try AI prediction
    try {
        aiPrediction = await predictCheckedInQueueWaitMinutesService({
            aiContext,
            queueLikeItems,
            queueLike,
            checkedInAt,
            originalScheduledTime,
            latestPredictedStart: ruleBasedForecast.estimated_start,
            ruleBasedWaitMinutes: ruleBasedForecast.predicted_wait_minutes
        })
    } catch (error) {
        console.error(error)
        return ruleBasedForecast  // Fallback to rule-based
    }
    
    // Bước 4: Validate AI prediction
    if !aiPrediction?.available || 
       typeof aiPrediction.predicted_wait_minutes !== "number" ||
       aiPrediction.predicted_wait_minutes < 0:
        return ruleBasedForecast  // Fallback if AI not available
    
    // Bước 5: Use AI prediction
    return {
        estimated_start: derivePredictedStart(
            checkedInAt,
            aiPrediction.predicted_wait_minutes,
            ruleBasedForecast.base_time,
            ...
        ),
        predicted_wait_minutes: aiPrediction.predicted_wait_minutes,
        prediction_source: aiPrediction.prediction_source,
        model_version: aiPrediction.model_version
    }
}
```

### 4.2 So Sánh Rule-based vs AI

Nếu `QUEUE_AI_COMPARE_WITH_HEURISTIC = true`:
```
log: [queue forecast compare]
     queue#${queueId}
     provider=${aiPrediction.prediction_source}
     model_wait=${aiPrediction.predicted_wait_minutes}
     heuristic_wait=${ruleBasedForecast.predicted_wait_minutes}
     delta=${aiPrediction.predicted_wait_minutes - ruleBasedForecast.predicted_wait_minutes}
```

---

## 5. NORMALIZE TRONG WORKING PERIODS

### 5.1 Vấn đề
Predicted start có thể rơi ngoài khoảng làm việc của bác sĩ.

### 5.2 Giải pháp
```javascript
normalizeDateTimeWithinWorkingPeriods = (dateValue, workingPeriods) => {
    if !dateValue hoặc workingPeriods trống:
        return dateValue
    
    for each period in workingPeriods:
        if dateValue nằm trong period:
            return dateValue  // OK, nằm trong giờ làm việc
    
    // Nếu ngoài giờ làm việc, find closest working period
    for each period in workingPeriods:
        if dateValue < period.start:
            return period.start  // Nhảy tới khoảng làm việc tiếp theo
    
    // Nếu sau tất cả periods, dùng start của period cuối cùng
    return workingPeriods.last().start
}
```

---

## 6. COMPUTATION FLOW DIAGRAM

```
Queue Items (sorted by service order)
        ↓
    For each queue
        ↓
    ├─ Is Completed? (actual_start && actual_end)
    │  ├─ YES → calculated_wait = end - checked_in
    │  │        forecast_cursor = actual_end + turnaround_buffer
    │  └─ NO → Go to next check
    │
    ├─ Is In Progress? (actual_start && !actual_end)
    │  ├─ YES → forecast_cursor = actual_start + avg_duration + turnaround
    │  │        calculated_wait = avg_duration estimate
    │  └─ NO → Go to next check
    │
    └─ Not Started Yet
       ├─ Tính Rule-based forecast
       │  ├─ baseTime = max(forecastCursor, eligibleStart, now)
       │  ├─ waitMinutes = time_diff(baseTime, anchor)
       │  └─ estimatedStart = baseTime
       │
       └─ Tính Adaptive (Rule + AI)
          ├─ If checked_in && AI_ENABLED && catboost_available
          │  ├─ Build feature row
          │  ├─ Run CatBoost inference
          │  ├─ Validate prediction
          │  └─ Use AI prediction if valid
          └─ Else use rule-based
                └─ forecast_cursor = estimatedStart + avg_duration + turnaround
```

---

## 7. KEY PARAMETERS & ENVIRONMENT VARIABLES

| Variable | Default | Mô Tả |
|----------|---------|-------|
| `DEFAULT_QUEUE_VISIT_DURATION_MINUTES` | 15 | Thời gian khám mặc định |
| `DEFAULT_QUEUE_TURNAROUND_MINUTES` | 5 | Buffer giữa 2 bệnh nhân |
| `MAX_CHECKED_IN_EARLY_CALL_MINUTES` | 10 | Gọi trước tối đa |
| `MAX_DYNAMIC_FORECAST_VISIT_DURATION_MINUTES` | 60 | Max duration cho trimmed average |
| `MIN_DYNAMIC_DURATION_SAMPLES` | 3 | Minimum samples để tính avg |
| `RECENT_COMPLETED_QUEUE_SAMPLE_SIZE` | 20 | Số queue hoàn thành để tính trung bình |
| `QUEUE_AI_FORECAST_ENABLED` | true | Enable AI prediction |
| `QUEUE_AI_FORECAST_PROVIDER` | local_heuristic | Provider: catboost_local, local_heuristic, ... |
| `QUEUE_AI_MAX_WAIT_MINUTES` | 480 | Max wait time prediction (8 giờ) |
| `QUEUE_AI_COMPARE_WITH_HEURISTIC` | false | Log comparison khi true |
| `BUSINESS_TIMEZONE_OFFSET` | +07:00 | Timezone business |

---

## 8. VALIDATION & CLAMPING

### 8.1 Predicted Wait Minutes
```javascript
clampWaitMinutes = (value) => {
    if !Number.isFinite(value):
        return 0
    return max(0, min(QUEUE_AI_MAX_WAIT_MINUTES, round(value)))
}
```

### 8.2 Visit Duration
```javascript
clampDurationMinutes = (value) => {
    return min(MAX_QUEUE_VISIT_DURATION_MINUTES,
              max(MIN_QUEUE_VISIT_DURATION_MINUTES, value))
}
```

---

## 9. VÍ DỤ TÍNH TOÁN

### Scenario: Bác sĩ A, vào lúc 9:00 sáng

**Data:**
- Bác sĩ A khám bình thường 15 phút/người
- Queue trước: Q1 (9:00-9:15), Q2 (9:15-9:30), Q3 (chưa check-in)
- Bệnh nhân Q3 check-in lúc 9:25

**Tính toán:**

1. **Q1 & Q2** (đã hoàn thành):
   - forecastCursor = 9:30 + 5 phút = 9:35

2. **Q3** (chưa bắt đầu):
   ```
   baseTime = max(9:35, 9:30, 9:00) = 9:35
   checkedInAt = 9:25
   predictionAnchor = 9:25
   
   predictedWaitMinutes = (9:35 - 9:25) = 10 phút
   estimatedStart = 9:35
   forecastCursor = 9:35 + 15 + 5 = 9:55
   ```

**Result:** Q3 chờ khoảng 10 phút, bắt đầu khám lúc 9:35

---

## 10. DATA FLOW: EXPORT TO TRAINING

File: `export-queue-training-data.js`

```javascript
// Exported columns for AI model training:
{
    queue_id,
    appointment_id,
    patient_id,
    doctor_id,
    specialty_id,
    specialty_name,
    
    // Queue timing
    queue_number,
    checked_in_at,
    original_estimated_start,
    estimated_start,
    actual_start,
    actual_end,
    
    // Predictions
    predicted_wait_minutes,          // Rule-based prediction
    latest_predicted_wait_time,      // AI prediction
    latest_predicted_start,
    latest_prediction_source,
    latest_model_version,
    
    // Calculated metrics
    visit_duration_minutes,          // actual_end - actual_start
    start_delay_from_original_minutes,  // actual_start - original_estimated_start
    start_delay_from_latest_minutes,    // actual_start - estimated_start
    checkin_to_start_minutes,        // actual_start - checked_in_at
    
    // Labels
    no_show_flag,
    completed_flag
}
```

---

## SUMMARY

**Rule-Engine Formula = Hybrid Heuristic + AI**

- **Rule-based:** Đơn giản, tính dựa trên avg duration + queue position
- **AI-based:** Phức tạp, sử dụng 20+ features + CatBoost model
- **Fallback:** Luôn sử dụng rule-based nếu AI không khả dụng
- **Khác biệt chính:** Normalize trong working periods + Dynamic duration weighting
